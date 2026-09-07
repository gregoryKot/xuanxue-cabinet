// Текстовое сообщение вне ответа на кнопку (docs/PLAN.md §6): активное
// ожидание темы (bot-session.schema.ts, кнопка «Изменить тему») → тема
// сохраняется, текст рассылки пересобирается. Только личный чат учителя/
// админа — сторонним сообщениям бот не отвечает (CLAUDE.md «Ноль нагрузки»:
// это чат учителя, не публичный).
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { LESSON_LIMITS } from '@xuanxue/shared';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { errorMessage, errorStack } from '../../common/error-info';
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

  async handle(ctx: Context): Promise<void> {
    const now = DateTime.utc();
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
    if (!text) return; // не текст — ждём дальше, сессия не закрывается
    const topic = text.slice(0, LESSON_LIMITS.topic);
    await this.lessonsService.update(lessonId.toString(), { topic });
    await this.botSessions.clear(chatId);
    await this.topicRebuild.rebuild(lessonId, now);
    await ctx.reply(`Тема сохранена: ${topic}`).catch(() => null);
  }
}
