// body-parser (через http-errors) кидает ошибки тела запроса как обычный
// Error с полями `type` (строка) и `status` (число, всегда 4xx) — не
// HttpException, mapExternalException их не оборачивает. Вынесено из
// domain-exception.filter.ts — тот же приём, что http-exception.mapper.ts:
// файл на потолке храповика, не место разрастаться (CLAUDE.md «Храповики»).
//
// Аудит 2026-09-21 (HIGH): фильтр раньше узнавал только `entity.too.large`
// (413, лимит тела) — остальные типы (`entity.parse.failed`, битый JSON,
// 400; `charset.unsupported`, 415; и т.п.) падали в ветку 500 с error-логом
// и ложным алёртом админу, хотя это обычный отказ по вводу (4xx), не сбой
// сервера. Теперь любой такой тип отвечает своим статусом и кодом
// `bad_request` — `entity.too.large` остаётся особым случаем со своим
// текстом, как было.
import { HttpStatus } from '@nestjs/common';
import type { ApiErrorBody } from '@xuanxue/shared';

const PAYLOAD_TOO_LARGE_MESSAGE =
  'Файл или текст больше допустимого. Уменьшите его и попробуйте ещё раз.';
const BAD_REQUEST_MESSAGE =
  'Не удалось прочитать запрос. Обновите страницу и попробуйте ещё раз.';

/** Форма ошибки body-parser: `type` и `status` — обычные string/number, не
 * enum (http-errors их так и создаёт), проверяем структурно. */
export function isBodyParserError(
  exception: Error,
): exception is Error & { type: string; status: number } {
  const candidate = exception as { type?: unknown; status?: unknown };
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500
  );
}

export function fromBodyParserError(
  exception: Error & { type: string; status: number },
  requestId: string | undefined,
): ApiErrorBody {
  if (exception.type === 'entity.too.large') {
    return {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'payload_too_large',
      message: PAYLOAD_TOO_LARGE_MESSAGE,
      requestId,
    };
  }
  return {
    statusCode: exception.status,
    code: 'bad_request',
    message: BAD_REQUEST_MESSAGE,
    requestId,
  };
}
