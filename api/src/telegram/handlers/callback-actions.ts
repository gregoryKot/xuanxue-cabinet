// Действия по кнопкам предпросмотра — вынесены из callback-query.handler.ts
// (файл-лимит 150 строк, CLAUDE.md «Храповики»): маршрутизация и проверка
// доступа остаются в хендлере, здесь — что делает каждое действие.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { ConflictError, NotFoundError } from '../../common/errors';
import type { BotSessionService } from '../bot-session.service';

// Экспортирована — callback-query.handler.ts зовёт её же в своём catch, не
// повторяет литерал (CLAUDE.md «Одна механика — один компонент»).
export const GENERIC_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';

/** Ошибка домена (рассылка уже отправлена/отменена) — текст уже готов по
 * VOICE (broadcast-journal.queries.ts), его и показываем; неизвестная
 * ошибка — общий текст, не исключение наружу. */
function userFacingError(err: unknown): string {
  return err instanceof NotFoundError || err instanceof ConflictError
    ? err.message
    : GENERIC_ERROR;
}

export async function handleCancel(
  ctx: Context,
  broadcasts: BroadcastsService,
  broadcastId: string,
): Promise<void> {
  try {
    await broadcasts.cancel(broadcastId);
    await ctx.editMessageText('Отменено. Ссылка не уйдёт.').catch(() => null);
  } catch (err) {
    await ctx.editMessageText(userFacingError(err)).catch(() => null);
  }
}

export async function handleTopicButton(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  lessonId: string,
  now: DateTime,
): Promise<void> {
  await botSessions.startTopicWait(chatId, lessonId, now);
  await ctx.editMessageText('Напишите тему одним сообщением.').catch(() => null);
}
