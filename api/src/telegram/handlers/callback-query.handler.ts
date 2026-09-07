// Кнопки предпросмотра (docs/PLAN.md §6): «Отменить»/«Изменить тему» — один
// роутер по префиксу callback data (CLAUDE.md «Ошибки»: действие:параметр).
// `answerCbQuery()` до обращения к БД — иначе Telegram показывает
// пользователю крутилку до тайм-аута. Отправитель сверяется с TeacherChats —
// чужой callback молча игнорируется, warn в лог без PII (только chatId).
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { BotSessionService } from '../bot-session.service';
import { parseCallbackData, type CallbackAction } from '../callback-data';
import { TeacherChats } from '../teacher-chats';
import { handleCancel, handleTopicButton } from './callback-actions';

@Injectable()
export class CallbackQueryHandler {
  private readonly logger = new Logger(CallbackQueryHandler.name);

  constructor(
    private readonly teacherChats: TeacherChats,
    private readonly broadcastsService: BroadcastsService,
    private readonly botSessions: BotSessionService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    const now = DateTime.utc();
    await ctx.answerCbQuery().catch(() => null);
    try {
      const query = ctx.callbackQuery;
      const data = query && 'data' in query ? query.data : undefined;
      const parsed = data ? parseCallbackData(data) : null;
      if (!parsed || !Types.ObjectId.isValid(parsed.id)) return;

      const chatId = ctx.chat?.id;
      if (chatId === undefined || !(await this.isTeacherChat(chatId, now))) {
        this.logger.warn(`callback от чата без доступа: chatId=${chatId ?? 'н/д'}`);
        return;
      }

      await this.dispatch(ctx, parsed.action, parsed.id, chatId, now);
    } catch (err) {
      this.logger.error(`telegram.callback_query: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply('Что-то пошло не так. Попробуйте ещё раз.').catch(() => null);
    }
  }

  private async dispatch(
    ctx: Context,
    action: CallbackAction,
    id: string,
    chatId: number,
    now: DateTime,
  ): Promise<void> {
    if (action === 'cancel') return handleCancel(ctx, this.broadcastsService, id);
    if (action === 'topic') {
      return handleTopicButton(ctx, this.botSessions, chatId, id, now);
    }
  }

  private async isTeacherChat(chatId: number, now: DateTime): Promise<boolean> {
    const chats = await this.teacherChats.list(now);
    return chats.some((c) => c.chatId === String(chatId));
  }
}
