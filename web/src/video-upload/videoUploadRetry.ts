// Повтор шага загрузки видео на сетевой сбой и занятость сервера (ADR-0137,
// ADR-0165): расписание пауз, разбор ошибки «повторить или остановиться» и сам
// цикл повтора. Вынесено из прогона (videoUploadRunner.ts, файловый лимит,
// CLAUDE.md «Храповики»): прогон — про порядок шагов, политика повтора —
// отдельно и общая для всех видов видео-файлов.
import { ApiError } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';

const UPLOAD_FAILED_MESSAGE = 'Не удалось загрузить видео. Попробуйте ещё раз.';

// Расписание пауз между повторами — 2, 4, 8, 16, 30 с, дальше по 30 с:
// плохая связь ученика с телефона не должна долбить сервер каждую секунду,
// но и не должна ждать минутами там, где сеть уже вернулась раньше таймера
// (CLAUDE.md «Без магических чисел» — именованный список, не литерал внутри
// функции).
const RETRY_DELAYS_SEC = [2, 4, 8, 16, 30] as const;
const MAX_RETRY_DELAY_SEC = 30;

/** Пауза перед повтором попытки номер `attempt` (с 1). `retryAfterSec` —
 * подсказка сервера (503 «другая загрузка», ADR-0137/raw-upload-concurrency)
 * побеждает расписание, если она больше нашего шага: сервер знает точнее. */
export function videoUploadRetryDelaySeconds(
  attempt: number,
  retryAfterSec?: number,
): number {
  const index = Math.max(0, attempt - 1);
  const scheduled = RETRY_DELAYS_SEC[index] ?? MAX_RETRY_DELAY_SEC;
  if (retryAfterSec !== undefined && retryAfterSec > scheduled) return retryAfterSec;
  return scheduled;
}

type VideoUploadErrorClass =
  { kind: 'retry'; retryAfterSec?: number } | { kind: 'stop'; message: string };

// Сетевой сбой и таймаут — ApiError со status 0 (http.ts). Сервер занят
// (503, потолок одновременных частей — raw-upload-concurrency.ts) и
// временный сбой (5xx) — тоже повтор, не отказ ученику. Остальное (4xx —
// часть не совпала, файл изменился, попытку проверили) — стоп с текстом
// сервера (VOICE.md): бесконечно повторять запрос, который сервер
// осмысленно отверг, значит никогда не сказать человеку правду.
const RATE_LIMITED_STATUS = 429;

export function classifyVideoUploadError(err: unknown): VideoUploadErrorClass {
  if (err instanceof ApiError) {
    // 429 — слишком часто, не «отказали навсегда» (аудит 2026-10-01): пауза
    // по Retry-After и дальше та же загрузка, а не «Слишком много запросов»
    // вместо видео.
    if (
      err.status === 0 ||
      err.status === RATE_LIMITED_STATUS ||
      err.status === 503 ||
      err.status >= 500
    ) {
      return { kind: 'retry', retryAfterSec: err.retryAfterSec };
    }
    return { kind: 'stop', message: err.message };
  }
  return { kind: 'retry' };
}

export interface WithRetryOptions {
  isCancelled: () => boolean;
  waitForResume: (delaySec: number) => Promise<void>;
  onFailed: (error: FormError) => void;
}

/** Повторяет `step()` на сетевой сбой/занятость сервера (503) с паузой по
 * расписанию (videoUploadRetryDelaySeconds); отказ сервера (4xx) —
 * `onFailed` и стоп. `undefined` — шаг не завершился успехом (отказ или
 * отмена снаружи), вызывающий обязан выйти. */
export async function withRetry<T>(
  step: () => Promise<T>,
  options: WithRetryOptions,
): Promise<T | undefined> {
  const { isCancelled, waitForResume, onFailed } = options;
  let attempt = 1;
  for (;;) {
    if (isCancelled()) return undefined;
    try {
      return await step();
    } catch (err) {
      if (isCancelled()) return undefined;
      const classified = classifyVideoUploadError(err);
      if (classified.kind === 'stop') {
        onFailed(errorFrom(err, UPLOAD_FAILED_MESSAGE));
        return undefined;
      }
      await waitForResume(
        videoUploadRetryDelaySeconds(attempt, classified.retryAfterSec),
      );
      if (isCancelled()) return undefined;
      attempt += 1;
    }
  }
}
