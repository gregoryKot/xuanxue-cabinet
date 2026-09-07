// Общий поток «сохранить или объяснить, почему нет» для потоков темы и
// записи (message.handler.ts) — CLAUDE.md «Одна механика — один компонент»:
// раньше handleTopic сам разбирал NotFoundError/прочую ошибку, handleRecording
// дублировал бы то же самое для своего save().
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { NotFoundError } from '../../common/errors';
import type { BotSessionService } from '../bot-session.service';

export interface SaveOrExplainTexts {
  /** Занятие пропало (отменили/удалили) — переоткрывать нечего, ожидание закрываем. */
  notFound: string;
  /** Сбой не про занятие (Mongo недоступна и т. п.) — ожидание остаётся,
   * учитель может попробовать ещё раз без открытия предпросмотра заново. */
  failed: string;
}

/** `true` — `save()` прошёл, вызывающий код продолжает свой путь (пересборка
 * темы, подтверждение записи); `false` — ответ учителю уже отправлен здесь,
 * дальше делать нечего. */
export async function saveOrExplain(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  save: () => Promise<void>,
  texts: SaveOrExplainTexts,
  onError: (message: string, stack?: string) => void,
): Promise<boolean> {
  try {
    await save();
    return true;
  } catch (err) {
    if (err instanceof NotFoundError) {
      await botSessions.clear(chatId);
      await ctx.reply(texts.notFound).catch(() => null);
      return false;
    }
    onError(`сохранение упало: ${errorMessage(err)}`, errorStack(err));
    await ctx.reply(texts.failed).catch(() => null);
    return false;
  }
}
