// Текстовое/видео/документ-сообщение вне ответа на кнопку (docs/PLAN.md §6):
// активное ожидание чата решает, тема это или запись. Только личный чат
// учителя/админа с активным каналом — как у CallbackQueryHandler (SECURITY.md
// §4). `now` — параметром (CLAUDE.md «Время»), хендлер сам DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { Context } from 'telegraf';
import { LESSON_LIMITS, type LessonDto } from '@xuanxue/shared';
import { BroadcastRecord } from '../../broadcasts/broadcast.schema';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { ClassRecord } from '../../classes/class.schema';
import { errorMessage, errorStack } from '../../common/error-info';
import { LessonsService } from '../../lessons/lessons.service';
import { BotSessionService } from '../bot-session.service';
import { TeacherChats } from '../teacher-chats';
import { saveOrExplain } from './message-save';
import { buildRecordingConfirmation } from './recording-confirmation';
import { extractRecordingSource } from './recording-source';

const NOT_UNDERSTOOD_MESSAGE =
  'Не понял, к какому занятию это. Ответьте на сообщение бота о закончившемся ' +
  'занятии или добавьте запись в кабинете, в «Планировании».';
const TOPIC_EXPIRED_MESSAGE =
  'Ожидание истекло. Нажмите «Изменить тему» под сообщением ещё раз.';
const RECORDING_EXPIRED_MESSAGE =
  'Ожидание записи истекло. Добавьте запись в кабинете, в «Планировании» у этого занятия.';

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);

  constructor(
    private readonly teacherChats: TeacherChats,
    private readonly botSessions: BotSessionService,
    private readonly lessonsService: LessonsService,
    private readonly topicRebuild: TopicRebuildService,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  private readonly logSaveError = (message: string, stack?: string): void =>
    this.logger.error(`telegram.message: ${message}`, stack);

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      const from = ctx.from;
      if (!from) return;
      const chats = await this.teacherChats.list(now);
      if (!chats.some((c) => c.chatId === String(from.id))) return;

      const session = await this.botSessions.get(from.id, now);
      if (session?.kind === 'topic') {
        await this.handleTopic(ctx, session.lessonId, from.id, now);
        return;
      }
      if (session?.kind === 'recording') {
        await this.handleRecording(ctx, session.lessonId, from.id, now);
        return;
      }
      // Ожидание было, но истекло — сказать об этом с выполнимым действием,
      // а не молчать так же, как для сообщения без всякого ожидания.
      const expiredKind = await this.botSessions.hasExpired(from.id, now);
      if (expiredKind) {
        const text =
          expiredKind === 'recording' ? RECORDING_EXPIRED_MESSAGE : TOPIC_EXPIRED_MESSAGE;
        await ctx.reply(text).catch(() => null);
        return;
      }
      // Без ожидания ссылка/видео — учитель шлёт запись не под тем
      // сообщением; обычный текст мимо ожидания бот не комментирует вовсе.
      if (extractRecordingSource(ctx.message)) {
        await ctx.reply(NOT_UNDERSTOOD_MESSAGE).catch(() => null);
      }
    } catch (err) {
      this.logger.error(`telegram.message: ${errorMessage(err)}`, errorStack(err));
    }
  }

  private async handleTopic(
    ctx: Context,
    lessonId: Types.ObjectId,
    chatId: number,
    now: DateTime,
  ): Promise<void> {
    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text || text.startsWith('/')) return; // не текст темы — ждём дальше, сессия не закрывается
    const topic = text.slice(0, LESSON_LIMITS.topic);

    const saved = await saveOrExplain(
      ctx,
      this.botSessions,
      chatId,
      async () => {
        await this.lessonsService.update(lessonId.toString(), { topic });
      },
      {
        notFound:
          'Занятие не найдено — возможно, его отменили. Откройте предпросмотр заново.',
        failed: 'Не получилось сохранить тему. Попробуйте ещё раз.',
      },
      this.logSaveError,
    );
    if (!saved) return;

    await this.botSessions.clear(chatId);
    const rebuilt = await this.topicRebuild.rebuild(lessonId, now);
    const suffix = rebuilt ? '' : '. Пост уже ушёл в каналы со старой темой.';
    await ctx.reply(`Тема сохранена: ${topic}${suffix}`).catch(() => null);
  }

  private async handleRecording(
    ctx: Context,
    lessonId: Types.ObjectId,
    chatId: number,
    now: DateTime,
  ): Promise<void> {
    const source = extractRecordingSource(ctx.message);
    if (!source) return; // не источник — ждём дальше, сессия не закрывается

    let saved: LessonDto | undefined;
    const ok = await saveOrExplain(
      ctx,
      this.botSessions,
      chatId,
      async () => {
        saved = await this.lessonsService.addRecording(lessonId.toString(), source, now);
      },
      {
        notFound: 'Занятие не найдено — возможно, его отменили. Запись сохранять некуда.',
        failed: 'Не получилось сохранить запись. Пришлите ещё раз.',
      },
      this.logSaveError,
    );
    if (!ok || !saved) return;

    await this.botSessions.clear(chatId);
    const reply = await buildRecordingConfirmation(
      this.classModel,
      this.broadcastModel,
      saved,
    );
    await ctx.reply(reply).catch(() => null);
  }
}
