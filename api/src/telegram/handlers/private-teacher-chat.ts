// Общий вход для команд личного чата школы (`/тема`, `/меню`, `/проверка`,
// `/вопрос`, `/экзамен`) — только личный чат учителя/помощника/админа с
// активным каналом (PersonalChats.list — не по виду уведомления: сама
// доступность команды не зависит от того, что человек выключил). Раньше
// проверка жила в каждом хендлере отдельно — jscpd поймал дубль, вынесено
// сюда (CLAUDE.md «Одна механика — один компонент»).
//
// `/уведомления` здесь больше НЕТ (отзыв владельца 2026-09-19, ADR-0065):
// своими уведомлениями вправе управлять любой вошедший, включая ученика, а
// не только штат, — гейт переехал на BotUserAccessService
// (notifications-command.handler.ts). Здесь остаются только команды, которые
// отдают данные ШКОЛЫ (расписание, черновики, проверка работ) — это по
// определению штат.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { PersonalChats } from '../personal-chats';

/** `null` — не личный чат подключённого учителя/помощника/админа: вызывающий
 * хендлер просто выходит, без ответа (чужой чат не должен понимать, что бот
 * вообще что-то заметил). */
export async function resolvePrivatePersonalChatId(
  ctx: Context,
  personalChats: PersonalChats,
  now: DateTime,
): Promise<number | null> {
  if (ctx.chat?.type !== 'private') return null;
  const chatId = ctx.chat.id;
  const chats = await personalChats.list(now);
  if (!chats.some((c) => c.chatId === String(chatId))) return null;
  return chatId;
}
