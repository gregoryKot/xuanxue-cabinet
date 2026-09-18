// Приведение рассылки-ссылки на занятие (kind 'lesson_link', status
// 'scheduled') в соответствие с занятием — текст и момент отправки. Два
// повода: тема поменялась через бота (LessonsService.update из /тема или
// «Изменить тему») или занятие перенесено на другое время — ручной перенос
// (LessonsService.update, поле startsAt) или планировщиком
// (LessonPlannerService.planClass после moveLesson). Раньше сервис отвечал
// только за тему (docs/PLAN.md §6 «Планировщик», ADR-0054) — переименован
// под расширенную ответственность, механика та же: пересобирается через
// buildLessonLinkText, не копией рендера, запись — условным апдейтом, не
// read-then-write.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import { errorMessage, errorStack } from '../common/error-info';
import { encryptSchemaFrom } from '../common/field-policy';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { LESSON_ENCRYPT_SCHEMA } from '../lessons/lesson.schema';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { findClassForRecording, type PlannerLesson } from './broadcast-planner.queries';
import { buildLessonLinkText } from './broadcast-planner.render';
import { computeBroadcastSendTiming } from './broadcast-send-timing';
import { BroadcastModels } from './broadcast-models.provider';
import { BROADCAST_FIELD_POLICY } from './broadcast.schema';
import {
  hasCapturedDelivery,
  rescheduleUncapturedDeliveries,
  writeRebuiltBroadcast,
  type RebuildBroadcastLean,
} from './lesson-link-rebuild.queries';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

@Injectable()
export class LessonLinkRebuildService {
  private readonly logger = new Logger(LessonLinkRebuildService.name);

  // BroadcastModels — та же связка, что у RecordingBroadcastService/
  // SendNowService (broadcast-models.provider.ts): channelModel в бандле не
  // используется здесь, но заводить свой провайдер под одно поле меньше не
  // повод (CLAUDE.md «Одна механика — один компонент»).
  constructor(
    private readonly models: BroadcastModels,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /** `true` — нашли ещё не отправленную рассылку и привели её текст и момент
   * отправки в соответствие с текущим занятием; `false` — нечего пересобирать
   * (рассылка уже ушла/отменена, самой рассылки для занятия ещё нет,
   * занятие/класс пропали, раннер уже забрал доставку) или пересборка упала.
   * Вызывающий код (message.handler.ts, LessonsService.update,
   * LessonPlannerService) по этому флагу решает, писать ли учителю «пост уже
   * ушёл со старой темой/временем». */
  async rebuild(lessonId: Types.ObjectId, now: DateTime): Promise<boolean> {
    try {
      const broadcast = await this.models.broadcastModel
        .findOne(
          { lessonId, kind: 'lesson_link', status: 'scheduled' },
          { _id: 1, scheduledAt: 1 },
        )
        .lean<RebuildBroadcastLean | null>();
      if (!broadcast) return false;

      // Раннер захватывает доставку атомарно (pending → sending, ADR-0014,
      // claimDelivery в delivery-runner.queries.ts) и сразу за захватом читает
      // broadcast.text для отправки (delivery-runner.preflight.ts) — раньше,
      // чем broadcast.status успевает измениться (он меняется только после
      // исхода, delivery-runner.status.ts). Значит проверка одного лишь
      // status: 'scheduled' у broadcast не ловит доставку в процессе
      // отправки: пока хоть одна доставка не pending, текст/время мог уже
      // уйти получателю или вот-вот уйдёт с тем, что раннер прочитал раньше
      // нашей записи — переписывать их сейчас значит соврать учителю
      // «пересобрано».
      if (await hasCapturedDelivery(this.models.deliveryModel, broadcast._id))
        return false;

      const lessonDoc = await this.models.lessonModel
        .findById(lessonId)
        .lean<PlannerLesson>();
      if (!lessonDoc) return false;
      const lesson = decryptRecord(lessonDoc, LESSON_ENCRYPT_SCHEMA);
      const cls = await findClassForRecording(this.models.classModel, lesson.classId);
      if (!cls) return false;

      const settings = await this.settingsService.get();
      // target — та же арифметика, что у sendLessonBroadcast
      // (broadcast-planner.send.ts, computeBroadcastSendTiming): момент
      // рендера «через {минут}» и момент, на который переносится сама
      // отправка, — одно и то же значение, иначе текст и факт разойдутся.
      const { textNow: target } = computeBroadcastSendTiming(
        lesson.startsAt,
        cls.leadMinutes,
        now,
      );
      const text = await buildLessonLinkText(
        this.usersService,
        lesson,
        cls,
        settings.templates,
        target,
      );

      // Аудит 2026-09-12, M7: между первой проверкой выше и этой строкой
      // прошло несколько `await` (занятие, класс, настройки, рендер) — как
      // раз то окно, в которое раннер успевает захватить доставку и отправить
      // старое. Повторяем ту же проверку прямо перед записью, чтобы не
      // ответить учителю «пересобрано», когда часть каналов уже получила
      // старый пост. Полностью окно не закрывается: между этой проверкой и
      // updateOne в writeRebuiltBroadcast остаётся одна операция с БД —
      // раннер теоретически успевает захватить доставку ровно в этот момент.
      // Убрать его совсем можно только версией доставок (delivery version) в
      // условии `updateOne` — отдельная, более крупная правка, которую здесь
      // сознательно не делаем (ADR-0054).
      if (await hasCapturedDelivery(this.models.deliveryModel, broadcast._id))
        return false;

      const rebuilt = await writeRebuiltBroadcast(
        this.models.broadcastModel,
        broadcast,
        encryptRecord({ text }, ENCRYPT_SCHEMA),
        target,
        now,
      );
      if (!rebuilt) return false;

      await rescheduleUncapturedDeliveries(
        this.models.deliveryModel,
        broadcast._id,
        now,
        target,
      );
      return true;
    } catch (err) {
      // Занятие/тема уже сохранены (LessonsService.update прошёл раньше) —
      // сбой пересборки поста не должен выглядеть как отказ вызывающей
      // операции.
      this.logger.error(
        `пересборка рассылки занятия ${lessonId.toString()} упала: ${errorMessage(err)}`,
        errorStack(err),
      );
      return false;
    }
  }
}
