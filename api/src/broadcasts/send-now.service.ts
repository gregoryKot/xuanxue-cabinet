// «Отправить ссылку сейчас» (docs/PLAN.md §6 «Планирование», аудит В12):
// действие относится к дате занятия, не к слоту, поэтому маршрут
// `POST /lessons/:id/send-now` (контроллер — LessonsController, сервис
// живёт в broadcasts/ — почти весь код общий с планировщиком рассылок).
// Валидация (ссылка, каналы) и рендер текста — те же функции, что у
// BroadcastPlannerService/RecordingBroadcastService, не копии. Запись в
// Mongo (три ветки по статусу) — send-now.queries.ts (файл-лимит 150 строк).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { BroadcastDto, BroadcastStatus } from '@xuanxue/shared';
import { ConflictError, InvalidInputError, NotFoundError } from '../common/errors';
import { decryptRecord } from '../utils/encryption';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { LESSON_ENCRYPT_SCHEMA, LessonRecord } from '../lessons/lesson.schema';
import type { LeanLesson } from '../lessons/lesson.mapper';
import { LESSON_NOT_FOUND, assertLessonId } from '../lessons/lessons.queries';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { findActiveChannelIds, findClassForRecording } from './broadcast-planner.queries';
import { buildLessonLinkText } from './broadcast-planner.render';
import { BroadcastRecord } from './broadcast.schema';
import { BroadcastsService } from './broadcasts.service';
import {
  createSendNowBroadcast,
  reviveSendNowBroadcast,
  reviveSendNowDeliveries,
  rescheduleSendNowBroadcast,
  type ExistingSendNowBroadcast,
} from './send-now.queries';

// VOICE.md: что случилось и что сделать. Тексты «нет ссылки»/«нет каналов» —
// контракт из ТЗ аудита В12, дословно.
const NO_LINK_MESSAGE =
  'У занятия нет ссылки — добавьте её в занятии или в слоте расписания.';
const NO_CHANNELS_MESSAGE =
  'У занятия нет подключённых каналов — включите канал на экране «Каналы».';
const ALREADY_SENT_MESSAGE = 'Ссылка уже ушла/уходит — смотрите журнал рассылок.';
const LESSON_CANCELLED_MESSAGE =
  'Занятие отменено, слать ссылку некуда. Верните занятие в расписание, если это ошибка.';
const BROADCAST_VANISHED = 'Рассылка исчезла между шагами — попробуйте ещё раз.';
// Гонка (статус сменился между чтением и CAS) сходится за пару повторов на
// практике — предел не даёт зациклиться, а не гонится за теорией.
const MAX_STATUS_RACE_RETRIES = 3;

@Injectable()
export class SendNowService {
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
    private readonly broadcastsService: BroadcastsService,
  ) {}

  async sendNow(lessonId: string, now: DateTime): Promise<BroadcastDto> {
    assertLessonId(lessonId);
    const doc = await this.lessonModel.findById(lessonId).lean<LeanLesson>();
    if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
    const lesson = decryptRecord(doc, LESSON_ENCRYPT_SCHEMA);
    if (lesson.status === 'cancelled')
      throw new InvalidInputError(LESSON_CANCELLED_MESSAGE);

    // Класса нет в базе — тот же текст, что у отсутствующей ссылки: без
    // класса взять её неоткуда (редкий рассинхрон данных, не своя ветка).
    const cls = await findClassForRecording(this.classModel, lesson.classId);
    const link = lesson.zoomLinkOverride ?? cls?.zoomLink;
    if (!cls || !link) throw new InvalidInputError(NO_LINK_MESSAGE);

    const activeChannelIds = await findActiveChannelIds(
      this.channelModel,
      cls.channelIds,
    );
    if (activeChannelIds.length === 0) throw new InvalidInputError(NO_CHANNELS_MESSAGE);

    const settings = await this.settingsService.get();
    const text = await buildLessonLinkText(
      this.usersService,
      lesson,
      cls,
      settings.templates,
      now,
    );

    const existing = await this.broadcastModel
      .findOne({ lessonId: lesson._id, kind: 'lesson_link' })
      .lean<ExistingSendNowBroadcast | null>();

    const broadcastId = existing
      ? await this.applyToExisting(existing, activeChannelIds, text, now)
      : await createSendNowBroadcast(
          this.broadcastModel,
          this.deliveryModel,
          lesson._id,
          activeChannelIds,
          text,
          now,
        );

    return this.broadcastsService.getById(broadcastId.toString());
  }

  /** Три ветки по статусу (send-now.queries.ts); `false` — CAS проиграл
   * гонку раннеру/второму клику, перечитываем и решаем заново. */
  private async applyToExisting(
    existing: ExistingSendNowBroadcast,
    channelIds: Types.ObjectId[],
    text: string,
    now: DateTime,
  ): Promise<Types.ObjectId> {
    let current = existing;
    for (let attempt = 0; attempt < MAX_STATUS_RACE_RETRIES; attempt += 1) {
      if (current.status === 'sent') throw new ConflictError(ALREADY_SENT_MESSAGE);

      const ok =
        current.status === 'scheduled'
          ? await rescheduleSendNowBroadcast(
              this.broadcastModel,
              this.deliveryModel,
              current._id,
              now,
            )
          : await reviveSendNowBroadcast(
              this.broadcastModel,
              current._id,
              channelIds,
              text,
              now,
            );
      if (ok) {
        if (current.status !== 'scheduled') {
          await reviveSendNowDeliveries(this.deliveryModel, current._id, channelIds, now);
        }
        return current._id;
      }

      const fresh = await this.broadcastModel
        .findById(current._id, { status: 1 })
        .lean<{ status: BroadcastStatus } | null>();
      if (!fresh) throw new NotFoundError(BROADCAST_VANISHED);
      current = { _id: current._id, status: fresh.status };
    }
    throw new ConflictError(BROADCAST_VANISHED);
  }
}
