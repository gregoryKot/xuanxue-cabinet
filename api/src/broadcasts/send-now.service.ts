// «Отправить ссылку сейчас» (docs/PLAN.md §6 «Планирование», аудит В12):
// действие относится к дате занятия, не к слоту, поэтому маршрут
// `POST /lessons/:id/send-now` (контроллер — LessonsController, сервис
// живёт в broadcasts/ — почти весь код общий с планировщиком рассылок).
// Валидация (ссылка, каналы) и рендер текста — те же функции, что у
// BroadcastPlannerService/RecordingBroadcastService, не копии. Запись в
// Mongo для существующей рассылки (статус, гонка, реконструкция доставок) —
// send-now.queries.ts (файл-лимит 150 строк) целиком в applySendNowUpdate.
import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { decryptRecord } from '../utils/encryption';
import type { LeanLesson } from '../lessons/lesson.mapper';
import { LESSON_ENCRYPT_SCHEMA } from '../lessons/lesson.schema';
import { LESSON_NOT_FOUND, assertLessonId } from '../lessons/lessons.queries';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { findActiveChannelIds, findClassForRecording } from './broadcast-planner.queries';
import { buildLessonLinkText } from './broadcast-planner.render';
import { BroadcastModels } from './broadcast-models.provider';
import { BroadcastsService } from './broadcasts.service';
import {
  applySendNowUpdate,
  createSendNowBroadcast,
  type ExistingSendNowBroadcast,
} from './send-now.queries';
import type { BroadcastDto } from '@xuanxue/shared';

// VOICE.md: что случилось и что сделать. Тексты «нет ссылки»/«нет каналов» —
// контракт из ТЗ аудита В12, дословно.
const NO_LINK_MESSAGE =
  'У занятия нет ссылки — добавьте её в занятии или в слоте расписания.';
const NO_CHANNELS_MESSAGE =
  'У занятия нет подключённых каналов — включите канал на экране «Каналы».';
const LESSON_CANCELLED_MESSAGE =
  'Занятие отменено, слать ссылку некуда. Верните занятие в расписание, если это ошибка.';

@Injectable()
export class SendNowService {
  constructor(
    private readonly models: BroadcastModels,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
    private readonly broadcastsService: BroadcastsService,
  ) {}

  async sendNow(lessonId: string, now: DateTime): Promise<BroadcastDto> {
    assertLessonId(lessonId);
    const doc = await this.models.lessonModel.findById(lessonId).lean<LeanLesson>();
    if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
    const lesson = decryptRecord(doc, LESSON_ENCRYPT_SCHEMA);
    if (lesson.status === 'cancelled')
      throw new InvalidInputError(LESSON_CANCELLED_MESSAGE);

    // Класса нет в базе — тот же текст, что у отсутствующей ссылки: без
    // класса взять её неоткуда (редкий рассинхрон данных, не своя ветка).
    const cls = await findClassForRecording(this.models.classModel, lesson.classId);
    const link = lesson.zoomLinkOverride ?? cls?.zoomLink;
    if (!cls || !link) throw new InvalidInputError(NO_LINK_MESSAGE);

    const activeChannelIds = await findActiveChannelIds(
      this.models.channelModel,
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

    const existing = await this.models.broadcastModel
      .findOne({ lessonId: lesson._id, kind: 'lesson_link' })
      .lean<ExistingSendNowBroadcast | null>();

    const broadcastId = existing
      ? await applySendNowUpdate(
          this.models.broadcastModel,
          this.models.deliveryModel,
          existing,
          activeChannelIds,
          text,
          now,
        )
      : await createSendNowBroadcast(
          this.models.broadcastModel,
          this.models.deliveryModel,
          lesson._id,
          activeChannelIds,
          text,
          now,
        );

    return this.broadcastsService.getById(broadcastId.toString());
  }
}
