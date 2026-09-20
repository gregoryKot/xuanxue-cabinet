// /уведомления (ТЗ notifications-delivery.md §3): экран переключателей в
// личном чате. Доступ — BotUserAccessService, не resolvePrivatePersonalChatId
// (private-teacher-chat.ts, штат школы): своими уведомлениями вправе
// управлять любой вошедший, включая ученика (отзыв владельца 2026-09-19,
// ADR-0065) — unknown молчит, denied отвечает ACCESS_MESSAGE (CLAUDE.md
// «тихий отказ — самая дорогая ошибка»). Рендер экрана — notifications-menu.ts,
// тот же, что и у нажатия кнопки (CallbackQueryHandler → handleNotificationToggle)
// — CLAUDE.md «Одна механика — один компонент».
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { buildNotificationsMenu } from './notifications-menu';

@Injectable()
export class NotificationsCommandHandler {
  private readonly logger = new Logger(NotificationsCommandHandler.name);

  constructor(
    private readonly botAccess: BotUserAccessService,
    private readonly notificationPrefsService: NotificationPrefsService,
  ) {}

  // `now` не используется — BotUserAccessService.resolve() времени не
  // спрашивает; параметр остаётся ради общей сигнатуры handle(ctx, now),
  // которую TelegramBotService зовёт одинаково для всех команд (CLAUDE.md
  // «Время», тот же приём, что _now в telegram-exam-notifier.ts).
  async handle(ctx: Context, _now: DateTime): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      const access = await this.botAccess.resolve(ctx.chat.id);
      if (access.kind === 'unknown') return;
      if (access.kind === 'denied') {
        await ctx.reply(access.message).catch(() => null);
        return;
      }
      const { user } = access;

      const prefs = await this.notificationPrefsService.get(user.id, user.roles);
      const menu = buildNotificationsMenu(user.roles, prefs.enabled);
      await ctx
        .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./уведомления: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
