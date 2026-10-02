// Что делать с ошибкой автосохранения ответа (useAttemptSaveRunner.ts) —
// чистая функция без React и сети (CLAUDE.md «Тесты»). До аудита 2026-10-01
// повтор через 4 с шёл на ЛЮБУЮ ошибку, кроме «время вышло»: 429 троттлера
// (игнорируя Retry-After), «попытка уже сдана» из другой вкладки или бота,
// 400 на кривом ответе — вечный цикл запросов и ложное «не сохранилось»
// на экране. Теперь:
// - `expired` — сервер закрыл попытку по дедлайну: черновик стирается,
//   экран перечитывает попытку (ATTEMPT_EXPIRED_MESSAGE);
// - `stale` — сервер отверг осмысленно и навсегда: попытка уже сдана, её нет,
//   доступа нет — повторять бесполезно, нужно показать правду с сервера;
// - `retry` — временно: сети нет, 5xx, гонка сохранений (409), слишком
//   часто (429 — пауза не меньше Retry-After);
// - `stop` — остальные 4xx (кривой ответ): ошибка остаётся на экране, в сеть
//   больше не ходим, следующая правка ученика сохранит заново.
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';

const RATE_LIMITED_STATUS = 429;
const CONFLICT_STATUS = 409;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const SERVER_ERROR_STATUS_MIN = 500;
const MS_PER_SECOND = 1000;

export type AttemptSaveErrorVerdict =
  | { kind: 'expired' }
  | { kind: 'stale' }
  | { kind: 'retry'; delayMs: number }
  | { kind: 'stop' };

export function classifyAttemptSaveError(
  err: unknown,
  retryDelayMs: number,
): AttemptSaveErrorVerdict {
  if (!(err instanceof ApiError)) return { kind: 'retry', delayMs: retryDelayMs };
  if (err.message === ATTEMPT_EXPIRED_MESSAGE) return { kind: 'expired' };
  if (err.status === RATE_LIMITED_STATUS) {
    const retryAfterMs = (err.retryAfterSec ?? 0) * MS_PER_SECOND;
    return { kind: 'retry', delayMs: Math.max(retryDelayMs, retryAfterMs) };
  }
  if (
    err.status === 0 ||
    err.status >= SERVER_ERROR_STATUS_MIN ||
    err.status === CONFLICT_STATUS
  ) {
    return { kind: 'retry', delayMs: retryDelayMs };
  }
  if (
    err.message === ATTEMPT_NOT_IN_PROGRESS_MESSAGE ||
    err.status === NOT_FOUND_STATUS ||
    err.status === FORBIDDEN_STATUS
  ) {
    return { kind: 'stale' };
  }
  return { kind: 'stop' };
}
