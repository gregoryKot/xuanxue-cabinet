// Чистая логика загрузки видео-ответа частями (ADR-0137) — без DOM и без
// сети: слайсер файла, отпечаток, следующая недостающая часть, доля
// прогресса, расписание повторов и разбор сетевой ошибки. Юнит-тест без
// mongodb-memory-server и без DOM (CLAUDE.md «Тесты»).
import { ANSWER_VIDEO_LIMITS, ANSWER_VIDEO_TOO_LARGE_MESSAGE } from '@xuanxue/shared';
import { ApiError } from '../api/http';

/** Части шлются сырым телом — тот же тип, что сервер сверяет сигнатурой
 * первой части (ADR-0137), не `file.type` (тому не доверяем). */
const ANSWER_VIDEO_PART_CONTENT_TYPE = 'application/octet-stream';

/** Размер и дата изменения файла, без имени (ADR-0137) — переименованный тот
 * же файл продолжает ту же загрузку, тот же файл под другим слепком не
 * путается с чужим. Разделитель `:` — оба числа целые, коллизии не бывает. */
export function computeAnswerVideoFingerprint(file: File): string {
  return `${file.size}:${file.lastModified}`;
}

/** `null` — файл проходит по размеру, иначе готовый текст без похода в сеть
 * (ADR-0137 «Решение», клиентская предпроверка). */
export function checkAnswerVideoFileSize(sizeBytes: number): string | null {
  return sizeBytes > ANSWER_VIDEO_LIMITS.maxBytes ? ANSWER_VIDEO_TOO_LARGE_MESSAGE : null;
}

/** Число частей по заявленному размеру файла — та же формула, что у сервера
 * (`Math.ceil(sizeBytes / partBytes)`, answer-video.mapper.ts), но ответ
 * `POST /attempts/:id/answer-video` уже несёт готовый `partCount`, эта
 * функция нужна только там, где сервера ещё не спросили (прогресс до ответа
 * на старт есть незачем — используется в тестах и как страховка). */
export function answerVideoPartCount(sizeBytes: number, partBytes: number): number {
  if (sizeBytes <= 0 || partBytes <= 0) return 0;
  return Math.max(1, Math.ceil(sizeBytes / partBytes));
}

/** Часть `partNumber` (с 1) файла — сырой `Blob` с типом сырого тела, не
 * `file.type`. Последняя часть короче остальных ровно на остаток. */
export function sliceAnswerVideoPart(
  file: File,
  partNumber: number,
  partBytes: number,
): Blob {
  const start = (partNumber - 1) * partBytes;
  const end = Math.min(start + partBytes, file.size);
  return file.slice(start, end, ANSWER_VIDEO_PART_CONTENT_TYPE);
}

/** Первая недостающая часть (с 1) — по ней браузер продолжает загрузку,
 * пропуская уже принятые сервером (ADR-0137). `null` — всё уже принято. */
export function nextMissingAnswerVideoPart(
  partCount: number,
  receivedParts: number[],
): number | null {
  const received = new Set(receivedParts);
  for (let part = 1; part <= partCount; part += 1) {
    if (!received.has(part)) return part;
  }
  return null;
}

/** Доля 0..1 для полосы прогресса — по числу частей, не по байтам: часть
 * либо принята сервером целиком, либо нет, промежуточного «долетает» у
 * сырого PUT без XHR-события прогресса не различить, а дробить полосу по
 * ещё не отправленной части незачем (CLAUDE.md «Без магических чисел»). */
export function answerVideoUploadProgress(
  receivedCount: number,
  partCount: number,
): number {
  if (partCount <= 0) return 0;
  return Math.min(1, Math.max(0, receivedCount / partCount));
}

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
export function answerVideoRetryDelaySeconds(
  attempt: number,
  retryAfterSec?: number,
): number {
  const index = Math.max(0, attempt - 1);
  const scheduled = RETRY_DELAYS_SEC[index] ?? MAX_RETRY_DELAY_SEC;
  if (retryAfterSec !== undefined && retryAfterSec > scheduled) return retryAfterSec;
  return scheduled;
}

export type AnswerVideoErrorClass =
  { kind: 'retry'; retryAfterSec?: number } | { kind: 'stop'; message: string };

// Сетевой сбой и таймаут — ApiError со status 0 (http.ts). Сервер занят
// (503, потолок одновременных частей — raw-upload-concurrency.ts) и
// временный сбой (5xx) — тоже повтор, не отказ ученику. Остальное (4xx —
// часть не совпала, файл изменился, попытку проверили) — стоп с текстом
// сервера (VOICE.md): бесконечно повторять запрос, который сервер
// осмысленно отверг, значит никогда не сказать человеку правду.
const RATE_LIMITED_STATUS = 429;

export function classifyAnswerVideoError(err: unknown): AnswerVideoErrorClass {
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
