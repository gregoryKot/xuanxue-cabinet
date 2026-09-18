// Маппинг HttpException (в т.ч. ValidationPipe и троттлер — оба кидают
// HttpException) в ApiErrorBody. Вынесено из domain-exception.filter.ts:
// тот уже стоял на потолке файла-храповика (CLAUDE.md «Храповики»), а
// добавлять туда алёрт админу и держать этот маппинг в одном файле —
// раздувать то, что и так на пределе (тот же принцип, что «Компонент React
// больше 150 — выноси хуки и подкомпоненты»).
import { HttpException } from '@nestjs/common';
import type { ApiErrorBody, ApiErrorCode } from '@xuanxue/shared';

const VALIDATION_MESSAGE = 'Проверьте, пожалуйста, введённые данные.';
// ThrottlerException несёт свой английский текст ('ThrottlerException: Too
// Many Requests') — он не проходит мимо fromHttpException() (правило
// CLAUDE.md «Ошибки»: текст исключения наружу не уходит без перевода).
const RATE_LIMIT_MESSAGE =
  'Слишком много запросов. Подождите минуту и попробуйте ещё раз.';

export function fromHttpException(
  exception: HttpException,
  requestId?: string,
): ApiErrorBody {
  const status = exception.getStatus();
  // Литерал 429, не HttpStatus.TOO_MANY_REQUESTS — та же причина, что у
  // codeForStatus() ниже: number из getStatus() против enum не проходит
  // eslint no-unsafe-enum-comparison.
  if (status === 429) {
    return {
      statusCode: status,
      code: codeForStatus(status),
      message: RATE_LIMIT_MESSAGE,
      requestId,
    };
  }
  const body = exception.getResponse();
  const rawMessage =
    typeof body === 'object' && body !== null && 'message' in body ? body.message : body;

  if (Array.isArray(rawMessage)) {
    return {
      statusCode: status,
      code: 'invalid_input',
      message: VALIDATION_MESSAGE,
      details: rawMessage.map(String),
      requestId,
    };
  }
  return {
    statusCode: status,
    code: codeForStatus(status),
    message: typeof rawMessage === 'string' ? rawMessage : exception.message,
    requestId,
  };
}

// Числовые литералы вместо HttpStatus: `status` из exception.getStatus() —
// обычное number, сравнение number с enum-константой в switch не проходит
// eslint no-unsafe-enum-comparison (и enum'ы в проекте не используются).
function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400: // Bad Request
      return 'invalid_input';
    case 401: // Unauthorized
      return 'unauthorized';
    case 403: // Forbidden
      return 'forbidden';
    case 404: // Not Found
      return 'not_found';
    case 409: // Conflict
      return 'conflict';
    case 413: // Payload Too Large
      return 'payload_too_large';
    case 429: // Too Many Requests
      return 'rate_limited';
    default:
      return 'http_error';
  }
}
