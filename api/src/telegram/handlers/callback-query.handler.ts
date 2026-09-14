// Кнопки бота (docs/PLAN.md §6): «Отменить»/«Изменить тему» у предпросмотра,
// «Записи не будет» у «Запись?», «Скопировал, отправил» у ручного канала,
// тумблеры у «Уведомления» — один роутер по префиксу callback data (CLAUDE.md
// «Ошибки»: действие:параметр). `answerCbQuery()` до обращения к БД — иначе
// Telegram показывает пользователю крутилку до тайм-аута. Отправитель
// сверяется с PersonalChats — чужой callback молча игнорируется, warn в лог
// без PII (только chatId). `now` — параметром от TelegramBotService
// (CLAUDE.md «Время»): хендлер сам DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { isNotificationKind } from '@xuanxue/shared';
import { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { UsersService } from '../../users/users.service';
import { BotSessionService } from '../bot-session.service';
import { parseCallbackData, type CallbackAction } from '../callback-data';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { PersonalChats } from '../personal-chats';
import { isMenuScreenAction } from './bot-menu';
import {
  GENERIC_ERROR,
  handleCancel,
  handleNoRecording,
  handleNotificationToggle,
  handleSent,
  handleTopicButton,
} from './callback-actions';
import { isValidCallbackParam } from './callback-params';
import { isExamCallbackAction, routeExamCallback } from './exam-callback-router';
import { ExamCommandHandler } from './exam-command.handler';
import { MenuCommandHandler } from './menu-command.handler';
import { handleMenuScreen } from './menu-screens';

@Injectable()
export class CallbackQueryHandler {
  private readonly logger = new Logger(CallbackQueryHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly broadcastsService: BroadcastsService,
    private readonly botSessions: BotSessionService,
    private readonly deliveriesService: DeliveriesService,
    private readonly usersService: UsersService,
    private readonly notificationPrefsService: NotificationPrefsService,
    private readonly menuCommandHandler: MenuCommandHandler,
    private readonly examBotPorts: ExamBotPortRegistry,
    private readonly examCommandHandler: ExamCommandHandler,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    await ctx.answerCbQuery().catch(() => null);
    try {
      const query = ctx.callbackQuery;
      const data = query && 'data' in query ? query.data : undefined;
      const parsed = data ? parseCallbackData(data) : null;
      if (!parsed || !isValidCallbackParam(parsed.action, parsed.id)) return;
      const { action, id } = parsed;

      // Личный чат и отправитель — тем же приёмом, что message.handler.ts:
      // identity для доступа — ctx.from.id, не ctx.chat.id (в личном чате
      // они совпадают, но from.id — источник истины и там, где бот когда-то
      // окажется в группе).
      const chatId = ctx.from?.id;
      if (chatId === undefined || ctx.chat?.type !== 'private') {
        this.logger.warn({ chatId: chatId ?? null }, 'callback от чата без доступа');
        return;
      }

      // Экзамен сдают ученики — до проверки PersonalChats (та пускает
      // только штат с активным личным каналом), тот же приём, что
      // MessageHandler для сессии examMedia (exam-callback-router.ts).
      if (isExamCallbackAction(action)) {
        await routeExamCallback(
          ctx,
          action,
          id,
          chatId,
          this.usersService,
          this.examBotPorts.get(),
          now,
        );
        return;
      }

      if (!(await this.isPersonalChat(chatId, now))) {
        // chatId — полем объекта, не в тексте: список редакции
        // (redact-paths.ts) управляет полями, не текстом строки
        // (SECURITY §1 п.2, §4).
        this.logger.warn({ chatId }, 'callback от чата без доступа');
        return;
      }

      await this.dispatch(ctx, action, id, chatId, now);
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
    if (action === 'menu' && isMenuScreenAction(id)) {
      return handleMenuScreen(
        ctx,
        {
          menu: this.menuCommandHandler,
          users: this.usersService,
          prefs: this.notificationPrefsService,
          exams: this.examCommandHandler,
        },
        id,
        chatId,
        now,
      );
    }
    if (action === 'notif' && isNotificationKind(id)) {
      return handleNotificationToggle(
        ctx,
        this.usersService,
        this.notificationPrefsService,
        chatId,
        id,
      );
    }
  }

  private async isPersonalChat(chatId: number, now: DateTime): Promise<boolean> {
    const chats = await this.personalChats.list(now);
    return chats.some((c) => c.chatId === String(chatId));
  }
}
