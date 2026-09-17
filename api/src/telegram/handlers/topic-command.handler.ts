// /тема (docs/PLAN.md §6): ближайшие даты занятий кнопками — тот же поток
// темы, что и «Изменить тему» из предпросмотра (handleTopicButton,
// callback-actions.ts). Только личный чат учителя/админа с активным каналом.
// `now` — параметром от TelegramBotService (CLAUDE.md «Время»): хендлер сам
// DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { Context } from 'telegraf';
import { LIST_LIMIT_MAX, SCHOOL_TZ } from '@xuanxue/shared';
import { ClassRecord } from '../../classes/class.schema';
import { errorMessage, errorStack } from '../../common/error-info';
import { LessonRecord } from '../../lessons/lesson.schema';
import { inlineButton } from '../callback-data';
import { PersonalChats } from '../personal-chats';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

const UPCOMING_LESSONS_LIMIT = 5;
const NO_LESSONS_MESSAGE = 'Ближайших занятий нет.';

interface UpcomingLesson {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  startsAt: Date;
}

@Injectable()
export class TopicCommandHandler {
  private readonly logger = new Logger(TopicCommandHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      const chatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
      if (chatId === null) return;

      // Только активные классы (как RecordingPromptService) — выключенному
      // классу спрашивать тему не о чем, кнопка вела бы в занятие, которое
      // никто не увидит.
      const activeClasses = await this.classModel
        .find({ active: true }, { title: 1 })
        .limit(LIST_LIMIT_MAX)
        .lean<{ _id: Types.ObjectId; title: string }[]>();
      const titleById = new Map(activeClasses.map((c) => [c._id.toString(), c.title]));

      const lessons = await this.lessonModel
        .find(
          {
            status: 'scheduled',
            startsAt: { $gte: now.toJSDate() },
            classId: { $in: activeClasses.map((c) => c._id) },
          },
          { classId: 1, startsAt: 1 },
        )
        .sort({ startsAt: 1 })
        .limit(UPCOMING_LESSONS_LIMIT)
        .lean<UpcomingLesson[]>();
      if (lessons.length === 0) {
        await ctx.reply(NO_LESSONS_MESSAGE).catch(() => null);
        return;
      }

      const buttons = lessons.map((lesson) => [
        inlineButton(lessonLabel(lesson, titleById), 'topic', lesson._id.toString()),
      ]);
      await ctx
        .reply('Выберите занятие:', { reply_markup: { inline_keyboard: buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./тема: ${errorMessage(err)}`, errorStack(err));
    }
  }
}

function lessonLabel(lesson: UpcomingLesson, titleById: Map<string, string>): string {
  const title = titleById.get(lesson.classId.toString()) ?? 'Занятие';
  const time = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' })
    .setZone(SCHOOL_TZ)
    .toFormat('dd.MM HH:mm');
  return `${title} ${time}`;
}
