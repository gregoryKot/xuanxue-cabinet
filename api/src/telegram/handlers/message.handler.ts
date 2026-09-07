// Текстовое сообщение вне ответа на кнопку (docs/PLAN.md §6): активное
// ожидание темы (bot-session.schema.ts, кнопка «Изменить тему») → тема
// сохраняется, текст рассылки пересобирается. Только личный чат учителя/
// админа — сторонним сообщениям бот не отвечает (CLAUDE.md «Ноль нагрузки»:
// это чат учителя, не публичный). `now` — параметром от TelegramBotService
// (CLAUDE.md «Время»): хендлер сам DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { LESSON_LIMITS } from '@xuanxue/shared';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { NotFoundError } from '../../common/errors';
import { LessonsService } from '../../lessons/lessons.service';
import { UsersService } from '../../users/users.service';
import { BotSessionService } from '../bot-session.service';

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly botSessions: BotSessionService,
    private readonly lessonsService: LessonsService,
    private readonly topicRebuild: TopicRebuildService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      const from = ctx.from;
      if (!from) return;
      const user = await this.usersService.findByTelegramId(from.id);
      if (!user || !(user.roles.includes('teacher') || user.roles.includes('admin')))
        return;

      const session = await this.botSessions.get(from.id, now);
      if (session?.kind === 'topic') {
        await this.handleTopic(ctx, session.lessonId, from.id, now);
        return;
      }
      // Ожидание было, но истекло (учитель не успел за 10 минут) — сказать
      // об этом, а не молчать так же, как для случайного сообщения без
      // всякого ожидания (CLAUDE.md «Ошибки»: текст говорит, что делать).
      if (await this.botSessions.hasExpired(from.id, now)) {
        await ctx
          .reply('Ожидание истекло. Нажмите «Изменить тему» под сообщением ещё раз.')
          .catch(() => null);
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

    try {
      await this.lessonsService.update(lessonId.toString(), { topic });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await this.botSessions.clear(chatId);
        await ctx
          .reply(
            'Занятие не найдено — возможно, его отменили. Откройте предпросмотр заново.',
          )
          .catch(() => null);
        return;
      }
      // Сбой не NotFound (Mongo недоступна и т. п.) — сессию не закрываем:
      // учитель может отправить тему ещё раз, не открывая предпросмотр заново.
      this.logger.error(
        `telegram.message: сохранение темы (lesson=${lessonId.toString()}) упало: ` +
          errorMessage(err),
        errorStack(err),
      );
      await ctx
        .reply('Не получилось сохранить тему. Попробуйте ещё раз.')
        .catch(() => null);
      return;
    }

    await this.botSessions.clear(chatId);
    const rebuilt = await this.topicRebuild.rebuild(lessonId, now);
    const suffix = rebuilt ? '' : '. Пост уже ушёл в каналы со старой темой.';
    await ctx.reply(`Тема сохранена: ${topic}${suffix}`).catch(() => null);
  }
}
