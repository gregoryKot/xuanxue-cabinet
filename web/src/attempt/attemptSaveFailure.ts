// Что происходит после провала PATCH ответов — вынесено из
// useAttemptSaveRunner.ts (храповик размера файлов, CLAUDE.md «Храповики»).
// Вердикт даёт attemptSaveError.ts; здесь он превращается в действия
// (черновик, повтор, перечитывание) и в состояние строки автосохранения.
//
// Аудит 2026-10-01, F44: отказ сервера навсегда (403 заблокированному
// посреди попытки, 404, «уже сдана») и 400 на самом ответе показывались как
// «Не сохранилось — попробуем ещё раз», хотя повтора не было и не будет —
// ученик ждал обещанного и не понимал, что случилось. Теперь такой исход —
// отдельный статус `refused` с текстом сервера (ACCESS_MESSAGE, «слишком
// длинный ответ»), и formatSaveStatus показывает именно его.
import { ApiError } from '../api/http';
import { clearAttemptDraft } from './attemptLocalDraft';
import { classifyAttemptSaveError } from './attemptSaveError';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'refused';

/** Исход провала для строки состояния: `error` — повтор будет (или экран
 * сейчас перечитает попытку по дедлайну), `refused` — не будет, текст
 * объясняет почему. */
export type AttemptSaveFailure =
  { status: 'error' } | { status: 'refused'; message: string };

/** Вердикты stale/stop даёт только ApiError (attemptSaveError.ts), так что
 * текст сервера здесь всегда есть; запас на случай, если это изменится. */
export const REFUSED_FALLBACK_MESSAGE = 'Не сохранилось';

interface SaveFailureEffects {
  attemptId: string;
  retryDelayMs: number;
  onExpired?: () => void;
  scheduleRetry: (delayMs: number) => void;
}

function refused(err: unknown): AttemptSaveFailure {
  return {
    status: 'refused',
    message: err instanceof ApiError ? err.message : REFUSED_FALLBACK_MESSAGE,
  };
}

export function applyAttemptSaveFailure(
  err: unknown,
  { attemptId, retryDelayMs, onExpired, scheduleRetry }: SaveFailureEffects,
): AttemptSaveFailure {
  // Не всякий сбой — повод повторять (attemptSaveError.ts, аудит
  // 2026-10-01): «уже сдана» из другой вкладки и 429 троттлера раньше
  // крутили PATCH каждые 4 с без конца.
  const verdict = classifyAttemptSaveError(err, retryDelayMs);
  switch (verdict.kind) {
    case 'expired':
      // Попытка закрыта дедлайном — черновик убирается целиком.
      clearAttemptDraft(attemptId);
      onExpired?.();
      return { status: 'error' };
    case 'stale':
      // Сервер отверг навсегда — не повторяем, перечитываем попытку:
      // экран покажет правду с сервера («Отправлено», нет доступа).
      onExpired?.();
      return refused(err);
    case 'retry':
      scheduleRetry(verdict.delayMs);
      return { status: 'error' };
    case 'stop':
      return refused(err);
  }
}
