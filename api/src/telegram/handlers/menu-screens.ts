// Экраны главного меню бота за кнопками `menu:*` — вынесено из
// callback-actions.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
// Переход между экранами правит то же сообщение, а не шлёт новое (CLAUDE.md
// «Telegram»), иначе чат зарастает копиями меню. Личность отправителя уже
// проверена в CallbackQueryHandler.handle.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import type { UsersService } from '../../users/users.service';
import {
  backToMenuButton,
  buildBotMenu,
  type BotMenu,
  type MenuScreenAction,
} from './bot-menu';
import type { MenuCommandHandler } from './menu-command.handler';
import { buildNotificationsMenu } from './notifications-menu';

interface MenuScreenDeps {
  menu: MenuCommandHandler;
  users: UsersService;
  prefs: NotificationPrefsService;
}

export async function handleMenuScreen(
  ctx: Context,
  deps: MenuScreenDeps,
  screen: MenuScreenAction,
  chatId: number,
  now: DateTime,
): Promise<void> {
  const view = await menuScreenView(deps, screen, chatId, now);
  if (!view) return;
  await ctx
    .editMessageText(view.text, { reply_markup: { inline_keyboard: view.buttons } })
    .catch(() => null);
}

async function menuScreenView(
  deps: MenuScreenDeps,
  screen: MenuScreenAction,
  chatId: number,
  now: DateTime,
): Promise<BotMenu | null> {
  if (screen === 'back') return buildBotMenu();
  if (screen === 'schedule') return deps.menu.scheduleScreen(now);
  // Экран уведомлений тот же, что у команды и у тумблеров: один рендер на
  // три входа (notifications-menu.ts).
  const user = await deps.users.findByTelegramId(chatId);
  if (!user) return null;
  const prefs = await deps.prefs.get(user.id, user.roles);
  const menu = buildNotificationsMenu(user.roles, prefs.enabled);
  return { text: menu.text, buttons: [...menu.buttons, backToMenuButton()] };
}
