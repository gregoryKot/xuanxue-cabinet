// Команды бота в меню Telegram. Их не было вовсе (отзыв владельца
// 2026-09-12: «в боте кроме команды старт ничего нет»): `/тема` и
// `/уведомления` написаны кириллицей, а Telegram принимает в команды только
// латиницу — в списке команд они не появлялись никогда, и всё, что бот
// умеет, оставалось невидимым.
//
// Кириллические варианты остаются рабочими (register-handlers.ts, hears) —
// кто привык набирать «/тема», ничего не теряет.
import type { Telegraf } from 'telegraf';

export const BOT_COMMANDS = [
  { command: 'menu', description: 'Меню бота' },
  { command: 'schedule', description: 'Ближайшие занятия' },
  { command: 'topic', description: 'Вписать тему занятия' },
  { command: 'exams', description: 'Экзамены' },
  { command: 'newquestion', description: 'Завести вопрос для экзамена' },
  { command: 'notifications', description: 'Что вам присылать' },
  { command: 'help', description: 'Что умеет бот' },
] as const;

/** Вызывается при старте приложения. Список перезаписывается целиком, так
 * что повторный вызов безвреден; сбой сети не должен ронять старт — ловит
 * вызывающий код (telegram-bot.service.ts), как у setWebhook. */
export async function registerBotCommands(bot: Telegraf): Promise<void> {
  await bot.telegram.setMyCommands([...BOT_COMMANDS]);
}
