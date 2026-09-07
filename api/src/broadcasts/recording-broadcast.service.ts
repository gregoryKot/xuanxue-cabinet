// Рассылка записи после «Добавить запись» (docs/PLAN.md §6 «Планирование»).
// LessonsService.addRecording() зовёт `ensureForRecording` всегда, вне
// зависимости от того, добавил ли `$push` новую запись или нет —
// идемпотентность живёт в уникальном индексе (lessonId, recordingKey)
// (broadcast.schema.ts), не в проверке результата апдейта: повтор с тем же
// url/file_id находит уже созданную рассылку и лишь досоздаёт недостающие
// доставки (insertBroadcastWithDeliveries), как и планировщик ссылок.
// Активные каналы/текст поста — те же функции, что у него же
// (broadcast-planner.queries.ts/render.ts), не копия.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { Recording } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../common/error-info';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { buildRecordingText } from './broadcast-planner.render';
import { findActiveChannelIds, findClassForRecording } from './broadcast-planner.queries';
import {
  insertBroadcastWithDeliveries,
  insertCancelledPlaceholder,
} from './broadcast.inserts';
import { BroadcastRecord } from './broadcast.schema';

interface RecordingLesson {
  classId: Types.ObjectId;
  topic: string;
  startsAt: Date;
  durationMin: number;
  leaderId?: Types.ObjectId;
}

const LESSON_PROJECTION = {
  classId: 1,
  topic: 1,
  startsAt: 1,
  durationMin: 1,
  leaderId: 1,
} as const;

/** url — то, что публикуется в посте, поэтому он же ключ идемпотентности,
 * когда есть; только видеофайл без ссылки (только Telegram) — ключ по
 * file_id. `assertHasRecordingSource` (lessons.recording.ts) гарантирует, что
 * хотя бы одно поле есть. */
function recordingKeyOf(recording: Recording): string | undefined {
  return recording.url ?? recording.telegramFileId;
}

@Injectable()
export class RecordingBroadcastService {
  private readonly logger = new Logger(RecordingBroadcastService.name);

  constructor(
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * `lessonId` — занятие, в которое запись уже добавлена (LessonsService
   * вызывает после `$push`, независимо от того, была ли запись новой).
   * Неожиданный сбой (Mongo недоступна, настройки школы не читаются и т. п.)
   * не должен уронить ответ `POST /lessons/:id/recording` — сама запись уже
   * сохранена к этому моменту, поэтому свой try/catch: лог `error` (RUNBOOK
   * §8.1 — тихий отказ рассылки самый дорогой) и cancelled-плейсхолдер с
   * причиной, чтобы сбой было видно в `broadcasts`, а не только в логе.
   */
  async ensureForRecording(
    lessonId: Types.ObjectId,
    recording: Recording,
    now: DateTime,
  ): Promise<void> {
    try {
      await this.send(lessonId, recording, now);
    } catch (err) {
      const message = errorMessage(err);
      this.logger.error(
        `рассылка записи занятия ${lessonId.toString()} упала: ${message}`,
        errorStack(err),
      );
      try {
        await insertCancelledPlaceholder(
          this.broadcastModel,
          {
            kind: 'recording',
            lessonId,
            recordingKey: recordingKeyOf(recording),
            // `message` — текст исключения Mongo/логики (недоступна база,
            // не разобрались настройки), не ответ адаптера канала: токен
            // канала сюда попасть не может, scrub не нужен.
            reason: `рассылка записи не создалась: ${message}`,
          },
          now,
        );
      } catch {
        // Второй сбой подряд (та же причина, что уронила send()) уже
        // залогирован выше — не роняем addRecording повторно.
      }
    }
  }

  private async send(
    lessonId: Types.ObjectId,
    recording: Recording,
    now: DateTime,
  ): Promise<void> {
    const lesson = await this.lessonModel
      .findById(lessonId, LESSON_PROJECTION)
      .lean<RecordingLesson | null>();
    // Занятие удалили между $push записи и этим вызовом — крайне редкий
    // случай (не транзакция), слать уже некому и незачем логировать как сбой.
    if (!lesson) return;

    const cls = await findClassForRecording(this.classModel, lesson.classId);
    if (!cls) return this.cancel(lessonId, recording, 'занятие без класса в базе', now);
    if (!cls.active) return this.cancel(lessonId, recording, 'класс выключен', now);

    const activeChannelIds = await findActiveChannelIds(
      this.channelModel,
      cls.channelIds,
    );
    if (activeChannelIds.length === 0) {
      return this.cancel(lessonId, recording, 'все каналы класса выключены', now);
    }

    const settings = await this.settingsService.get();
    const text = await buildRecordingText(
      this.usersService,
      lesson,
      cls,
      recording,
      settings.templates,
      now,
    );
    await insertBroadcastWithDeliveries(this.broadcastModel, this.deliveryModel, {
      kind: 'recording',
      lessonId,
      recordingKey: recordingKeyOf(recording),
      channelIds: activeChannelIds,
      telegramFileId: recording.telegramFileId,
      text,
      scheduledAt: now.toJSDate(),
    });
  }

  private async cancel(
    lessonId: Types.ObjectId,
    recording: Recording,
    reason: string,
    now: DateTime,
  ): Promise<void> {
    await insertCancelledPlaceholder(
      this.broadcastModel,
      { kind: 'recording', lessonId, recordingKey: recordingKeyOf(recording), reason },
      now,
    );
    this.logger.warn(
      `рассылка записи пропущена: занятие ${lessonId.toString()}: ${reason}`,
    );
  }
}
