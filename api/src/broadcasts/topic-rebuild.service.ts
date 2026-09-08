// Тема занятия поменялась через бота (LessonsService.update, docs/PLAN.md
// §6 «Telegram-бот») — если рассылка ссылки на это занятие ещё `scheduled`,
// её текст пересобирается по тому же шаблону, что и планировщик
// (buildLessonLinkText, broadcast-planner.render.ts), не копией рендера.
// Рассылка уже ушла/отменена — нечего пересобирать, тихо выходим.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import { Model } from 'mongoose';
import { errorMessage, errorStack } from '../common/error-info';
import { encryptSchemaFrom } from '../common/field-policy';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { ClassRecord } from '../classes/class.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { LESSON_ENCRYPT_SCHEMA, LessonRecord } from '../lessons/lesson.schema';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { findClassForRecording, type PlannerLesson } from './broadcast-planner.queries';
import { buildLessonLinkText } from './broadcast-planner.render';
import { BROADCAST_FIELD_POLICY, BroadcastRecord } from './broadcast.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

@Injectable()
export class TopicRebuildService {
  private readonly logger = new Logger(TopicRebuildService.name);

  constructor(
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /** `true` — нашли ещё не отправленную рассылку и пересобрали её текст;
   * `false` — нечего пересобирать (рассылка уже ушла/отменена, самой
   * рассылки для занятия ещё нет, занятие/класс пропали, раннер уже забрал
   * доставку) или пересборка упала. Вызывающий код (message.handler.ts) по
   * этому флагу решает, писать ли учителю «пост уже ушёл со старой темой». */
  async rebuild(lessonId: Types.ObjectId, now: DateTime): Promise<boolean> {
    try {
      const broadcast = await this.broadcastModel
        .findOne({ lessonId, kind: 'lesson_link', status: 'scheduled' }, { _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>();
      if (!broadcast) return false;

      // Раннер захватывает доставку атомарно (pending → sending, ADR-0014,
      // claimDelivery в delivery-runner.queries.ts) и сразу за захватом читает
      // broadcast.text для отправки (delivery-runner.preflight.ts) — раньше,
      // чем broadcast.status успевает измениться (он меняется только после
      // исхода, delivery-runner.status.ts). Значит проверка одного лишь
      // status: 'scheduled' у broadcast не ловит доставку в процессе
      // отправки: пока хоть одна доставка не pending, текст мог уже уйти
      // получателю или вот-вот уйдёт с тем, что раннер прочитал раньше нашей
      // записи — переписывать его сейчас значит соврать учителю «пересобрано».
      const captured = await this.deliveryModel.exists({
        broadcastId: broadcast._id,
        status: { $ne: 'pending' },
      });
      if (captured) return false;

      const lessonDoc = await this.lessonModel.findById(lessonId).lean<PlannerLesson>();
      if (!lessonDoc) return false;
      const lesson = decryptRecord(lessonDoc, LESSON_ENCRYPT_SCHEMA);
      const cls = await findClassForRecording(this.classModel, lesson.classId);
      if (!cls) return false;

      const settings = await this.settingsService.get();
      const text = await buildLessonLinkText(
        this.usersService,
        lesson,
        cls,
        settings.templates,
        now,
      );
      // Условный апдейт вместо read-then-write: даже с проверкой доставок
      // выше broadcast.status мог смениться между ним и записью (учитель
      // отменил рассылку из «Рассылки» ровно в этом окне) — matchedCount
      // === 0 значит «опоздали», текст остаётся прежним.
      const { matchedCount } = await this.broadcastModel.updateOne(
        { _id: broadcast._id, status: 'scheduled' },
        { $set: encryptRecord({ text }, ENCRYPT_SCHEMA) },
      );
      return matchedCount > 0;
    } catch (err) {
      // Тема уже сохранена в lessons (LessonsService.update прошёл раньше) —
      // сбой пересборки текста поста не должен выглядеть как отказ бота.
      this.logger.error(
        `пересборка текста рассылки занятия ${lessonId.toString()} упала: ${errorMessage(err)}`,
        errorStack(err),
      );
      return false;
    }
  }
}
