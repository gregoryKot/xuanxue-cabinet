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
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /** `true` — нашли ещё не отправленную рассылку и пересобрали её текст;
   * `false` — нечего пересобирать (рассылка уже ушла/отменена, самой
   * рассылки для занятия ещё нет, занятие/класс пропали) или пересборка
   * упала. Вызывающий код (message.handler.ts) по этому флагу решает, писать
   * ли учителю «пост уже ушёл со старой темой». */
  async rebuild(lessonId: Types.ObjectId, now: DateTime): Promise<boolean> {
    try {
      const broadcast = await this.broadcastModel
        .findOne({ lessonId, kind: 'lesson_link', status: 'scheduled' }, { _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>();
      if (!broadcast) return false;

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
      await this.broadcastModel.updateOne(
        { _id: broadcast._id },
        { $set: encryptRecord({ text }, ENCRYPT_SCHEMA) },
      );
      return true;
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
