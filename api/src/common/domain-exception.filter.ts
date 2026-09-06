// Единая точка перевода любой ошибки в HTTP-ответ (правило CLAUDE.md
// «Ошибки»): доменная ошибка → её статус/код, HttpException (в т.ч.
// ValidationPipe и троттлер, оба кидают HttpException) → её статус,
// всё остальное → 500 с логом стека и нейтральным текстом для пользователя —
// стек и текст исключения наружу не идут.
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { ApiErrorBody, ApiErrorCode } from '@xuanxue/shared';
import { errorMessage, errorStack } from './error-info';
import { DomainError } from './errors';

const GENERIC_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз через минуту.';
const VALIDATION_MESSAGE = 'Проверьте, пожалуйста, введённые данные.';
// ThrottlerException несёт свой английский текст ('ThrottlerException: Too
// Many Requests') — он не проходит мимо fromHttpException() (правило
// CLAUDE.md «Ошибки»: текст исключения наружу не уходит без перевода).
const RATE_LIMIT_MESSAGE =
  'Слишком много запросов. Подождите минуту и попробуйте ещё раз.';

// Минимальные интерфейсы вместо @types/express (которого нет в зависимостях
// api/) — фильтру нужны только `req.id` (пишет pino-http, см.
// logging.module.ts) и express-подобный `res.status().json()`.
interface RequestLike {
  id?: unknown;
}
interface ResponseLike {
  status(code: number): { json(body: ApiErrorBody): unknown };
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  // Явный токен вместо типа-интерфейса в сигнатуре: nestjs-pino Logger — не
  // interface, а конкретный класс, но зависеть в подписи от неё не хочется.
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<RequestLike>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const body = this.toBody(exception, requestId);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId?: string): ApiErrorBody {
    if (exception instanceof DomainError) {
      return {
        statusCode: exception.status,
        code: exception.code,
        message: exception.message,
        requestId,
      };
    }
    if (exception instanceof HttpException) {
      return fromHttpException(exception, requestId);
    }
    this.logger.error(
      `Необработанная ошибка (requestId=${requestId ?? '-'}): ${errorMessage(exception)}`,
      errorStack(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      message: GENERIC_MESSAGE,
      requestId,
    };
  }
}

function fromHttpException(exception: HttpException, requestId?: string): ApiErrorBody {
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
    case 429: // Too Many Requests
      return 'rate_limited';
    default:
      return 'http_error';
  }
}
