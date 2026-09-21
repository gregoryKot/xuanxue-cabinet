// Единый ответ незнакомцу (нет записи в users по этому telegramId) — для
// любого входа бота из общего списка команд Telegram (all_private_chats,
// ADR-0090): /menu, /exams, /notifications, /help видит и человек без
// аккаунта, потому что список — клиентский, Telegram показывает пункт меню
// ещё до вызова хендлера. Текст и его сборка (адрес сайта школы) — те же,
// что у /start (buildStrangerMessage, bot-menu.ts): один ответ незнакомцу на
// все входы, а не свой у каждой команды (CLAUDE.md «Одна механика — один
// компонент»). Молчание на этих пунктах меню отзыв владельца 2026-09-21
// читал как «бот сломан» — ADR-0090 называет это инвариантом отдельно:
// пункт меню, который отвечает молчанием, — баг.
import type { Context } from 'telegraf';
import type { SettingsService } from '../../settings/settings.service';
import { buildStrangerMessage } from './bot-menu';

export async function replyStranger(
  ctx: Context,
  settingsService: SettingsService,
): Promise<void> {
  const { schoolSiteUrl } = await settingsService.get();
  await ctx.reply(buildStrangerMessage(schoolSiteUrl)).catch(() => null);
}
