// /уведомления (ТЗ notifications-delivery.md §3): экран переключателей в
// личном чате — тот же поток доступа, что /тема (topic-command.handler.ts):
// только личный чат учителя/помощника/админа с активным каналом. Рендер
// экрана — notifications-menu.ts, тот же, что и у нажатия кнопки
// (CallbackQueryHandler → handleNotificationToggle) — CLAUDE.md «Одна
// механика — один компонент». `now` — параметром от TelegramBotService
// (CLAUDE.md «Время»): хендлер сам DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { UsersService } from '../../users/users.service';
import { PersonalChats } from '../personal-chats';
import { buildNotificationsMenu } from './notifications-menu';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

@Injectable()
export class NotificationsCommandHandler {
  private readonly logger = new Logger(NotificationsCommandHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly usersService: UsersService,
    private readonly notificationPrefsService: NotificationPrefsService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      const chatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
      if (chatId === null) return;

      const user = await this.usersService.findByTelegramId(chatId);
      if (!user) return;

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
