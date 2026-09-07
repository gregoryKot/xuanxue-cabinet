// Действия по кнопкам бота (предпросмотр, «Запись?», ручные каналы) —
// вынесены из callback-query.handler.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»): маршрутизация и проверка доступа остаются в хендлере, здесь —
// что делает каждое действие.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { ConflictError, NotFoundError } from '../../common/errors';
import type { DeliveriesService } from '../../deliveries/deliveries.service';
import type { BotSessionService } from '../bot-session.service';

// Экспортирована — callback-query.handler.ts зовёт её же в своём catch, не
// повторяет литерал (CLAUDE.md «Одна механика — один компонент»).
export const GENERIC_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';

/** Ошибка домена (рассылка уже отправлена/отменена, доставка не найдена) —
 * текст уже готов по VOICE (broadcast-journal.queries.ts/deliveries.service.ts),
 * его и показываем; неизвестная ошибка — общий текст, не исключение наружу. */
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

/** «Записи не будет» под «Запись?» — recordingPromptedAt уже стоит (ставится
 * до отправки самого вопроса, RecordingPromptService), повторно спрашивать
 * не будет и без этой кнопки; она только закрывает ожидание источника записи
 * в этом чате, чтобы случайное следующее сообщение не приняли за запись.
 * `clearIfLesson`, не `clear` — учитель мог получить второй вопрос «Запись?»
 * по другому занятию раньше, чем ответил на первый: «Записи не будет» под
 * первым не должно погасить ожидание второго. */
export async function handleNoRecording(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  lessonId: string,
): Promise<void> {
  await botSessions.clearIfLesson(chatId, lessonId);
  await ctx.editMessageText('Хорошо, записи не будет.').catch(() => null);
}

export async function handleSent(
  ctx: Context,
  deliveries: DeliveriesService,
  deliveryId: string,
  now: DateTime,
): Promise<void> {
  try {
    await deliveries.markSent(deliveryId, now);
    await ctx.editMessageText('Отмечено: отправлено.').catch(() => null);
  } catch (err) {
    await ctx.editMessageText(userFacingError(err)).catch(() => null);
  }
}
