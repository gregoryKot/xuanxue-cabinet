// Кнопки бота (docs/PLAN.md §6): «Отменить»/«Изменить тему» у предпросмотра,
// «Записи не будет» у «Запись?», «Скопировал, отправил» у ручного канала —
// один роутер по префиксу callback data (CLAUDE.md «Ошибки»: действие:параметр).
// `answerCbQuery()` до обращения к БД — иначе Telegram показывает
// пользователю крутилку до тайм-аута. Отправитель сверяется с TeacherChats —
// чужой callback молча игнорируется, warn в лог без PII (только chatId).
// `now` — параметром от TelegramBotService (CLAUDE.md «Время»): хендлер сам
// DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { BotSessionService } from '../bot-session.service';
import { parseCallbackData, type CallbackAction } from '../callback-data';
import { TeacherChats } from '../teacher-chats';
import {
  GENERIC_ERROR,
  handleCancel,
  handleNoRecording,
  handleSent,
  handleTopicButton,
} from './callback-actions';

@Injectable()
export class CallbackQueryHandler {
  private readonly logger = new Logger(CallbackQueryHandler.name);

  constructor(
    private readonly teacherChats: TeacherChats,
    private readonly broadcastsService: BroadcastsService,
    private readonly botSessions: BotSessionService,
    private readonly deliveriesService: DeliveriesService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    await ctx.answerCbQuery().catch(() => null);
    try {
      const query = ctx.callbackQuery;
      const data = query && 'data' in query ? query.data : undefined;
      const parsed = data ? parseCallbackData(data) : null;
      if (!parsed || !Types.ObjectId.isValid(parsed.id)) return;

      // Личный чат и отправитель — тем же приёмом, что message.handler.ts:
      // identity для доступа — ctx.from.id, не ctx.chat.id (в личном чате
      // они совпадают, но from.id — источник истины и там, где бот когда-то
      // окажется в группе).
      const chatId = ctx.from?.id;
      if (
        chatId === undefined ||
        ctx.chat?.type !== 'private' ||
        !(await this.isTeacherChat(chatId, now))
      ) {
        this.logger.warn(`callback от чата без доступа: chatId=${chatId ?? 'н/д'}`);
        return;
      }

      await this.dispatch(ctx, parsed.action, parsed.id, chatId, now);
    } catch (err) {
      this.logger.error(`telegram.callback_query: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply(GENERIC_ERROR).catch(() => null);
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
    if (action === 'norec') return handleNoRecording(ctx, this.botSessions, chatId, id);
    if (action === 'sent') return handleSent(ctx, this.deliveriesService, id, now);
  }

  private async isTeacherChat(chatId: number, now: DateTime): Promise<boolean> {
    const chats = await this.teacherChats.list(now);
    return chats.some((c) => c.chatId === String(chatId));
  }
}
