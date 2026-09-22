// Рассылка записи после «Добавить запись» (docs/PLAN.md §6 «Планирование»).
// LessonsService.addRecording() зовёт `ensureForRecording` всегда — идемпотентность
// живёт в уникальном индексе (lessonId, recordingKey), не в проверке результата
// апдейта: повтор с тем же url/file_id находит уже созданную рассылку и лишь
// досоздаёт недостающие доставки (insertBroadcastWithDeliveries), как и
// планировщик ссылок. Отбор каналов и текст поста — те же функции, что у него
// же (broadcast-channels.queries.ts, broadcast-planner.render.ts), не копия.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { Recording } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../common/error-info';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { findChannelsForLesson } from './broadcast-channels.queries';
import { CANCEL_REASON as REASON } from './broadcast-cancel-reasons';
import { buildRecordingText } from './broadcast-planner.render';
import { findClassForRecording } from './broadcast-planner.queries';
import { BroadcastModels } from './broadcast-models.provider';
import {
  insertBroadcastWithDeliveries,
  insertCancelledPlaceholder,
} from './broadcast.inserts';

interface RecordingLesson {
  classId: Types.ObjectId;
  topic: string;
  startsAt: Date;
  durationMin: number;
  leaderId?: Types.ObjectId;
  tags?: string[]; // отбор по тегу (ADR-0106) — опционально, как у PlannerLesson.tags
}

const LESSON_PROJECTION = {
  classId: 1,
  topic: 1,
  startsAt: 1,
  durationMin: 1,
  leaderId: 1,
  tags: 1,
} as const;

/** url — ключ идемпотентности, когда есть; только видеофайл (Telegram) —
 * ключ по file_id. `assertHasRecordingSource` (lessons.recording.ts)
 * гарантирует, что хотя бы одно поле есть. */
function recordingKeyOf(recording: Recording): string | undefined {
  return recording.url ?? recording.telegramFileId;
}

@Injectable()
export class RecordingBroadcastService {
  private readonly logger = new Logger(RecordingBroadcastService.name);

  constructor(
    private readonly models: BroadcastModels,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * `lessonId` — дата занятия, в которую запись уже добавлена. Неожиданный
   * сбой не должен уронить ответ `POST /lessons/:id/recording` — запись уже
   * сохранена, поэтому свой try/catch: лог `error` (RUNBOOK §8.1 — тихий
   * отказ рассылки самый дорогой) и cancelled-плейсхолдер с причиной.
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
          this.models.broadcastModel,
          {
            kind: 'recording',
            lessonId,
            recordingKey: recordingKeyOf(recording),
            // `message` — текст исключения Mongo/логики, не ответ адаптера
            // канала: токен сюда попасть не может, scrub не нужен.
            reason: `рассылка записи не создалась: ${message}`,
          },
          now,
        );
      } catch {
        // Второй сбой подряд уже залогирован выше — не роняем addRecording повторно.
      }
    }
  }

  private async send(
    lessonId: Types.ObjectId,
    recording: Recording,
    now: DateTime,
  ): Promise<void> {
    const lesson = await this.models.lessonModel
      .findById(lessonId, LESSON_PROJECTION)
      .lean<RecordingLesson | null>();
    // Дату удалили между $push и этим вызовом — редкий случай, слать некому.
    if (!lesson) return;

    const cls = await findClassForRecording(this.models.classModel, lesson.classId);
    if (!cls) return this.cancel(lessonId, recording, REASON.noClass, now);
    if (!cls.active) return this.cancel(lessonId, recording, REASON.classDisabled, now);

    // Отбор по тегу (ADR-0106) — тот же приём, что у broadcast-planner.send.ts.
    const lessonTags = [...(lesson.tags ?? []), ...(cls.tags ?? [])];
    const { activeChannelIds, matchingChannelIds } = await findChannelsForLesson(
      this.models.channelModel,
      cls.channelIds,
      lessonTags,
    );
    if (activeChannelIds.length === 0) {
      return this.cancel(lessonId, recording, REASON.allChannelsDisabled, now);
    }
    if (matchingChannelIds.length === 0) {
      return this.cancel(lessonId, recording, REASON.noChannelsForTags, now);
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
    await insertBroadcastWithDeliveries(
      this.models.broadcastModel,
      this.models.deliveryModel,
      {
        kind: 'recording',
        lessonId,
        recordingKey: recordingKeyOf(recording),
        channelIds: matchingChannelIds,
        telegramFileId: recording.telegramFileId,
        text,
        scheduledAt: now.toJSDate(),
      },
    );
  }

  private async cancel(
    lessonId: Types.ObjectId,
    recording: Recording,
    reason: string,
    now: DateTime,
  ): Promise<void> {
    await insertCancelledPlaceholder(
      this.models.broadcastModel,
      { kind: 'recording', lessonId, recordingKey: recordingKeyOf(recording), reason },
      now,
    );
    this.logger.warn(
      `рассылка записи пропущена: занятие ${lessonId.toString()}: ${reason}`,
    );
  }
}
