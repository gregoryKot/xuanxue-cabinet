// Фильтр нативных контроллеров (ADR-0181) — первый, который вешается на
// контроллер, а не на приложение. Глобальный DomainExceptionFilter отдаёт
// конверт ApiErrorBody, а профиль Workshop 3c98d4a требует `{"error":"<код>"}`
// и свой набор кодов. Через маршрутный фильтр проходят и исключения гвардов,
// в том числе 429 от глобального ThrottlerGuard (проверено native-account.e2e-spec.ts).
// Ошибки body-parser сюда не доходят — они случаются до маршрутизации, их
// ловит native-http.ts.
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { NativeErrorCode } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../common/error-info';
import { requestIdOf, type RequestLike } from '../common/request-info';
import { NativeAuthError } from './native-auth-error';
import { sendNativeError, type NativeResponseLike } from './native-response';

// По имени, а не instanceof: драйвер и Mongoose бросают разные классы с одним
// смыслом («базы нет»), и оба отличаются от ошибки данных, которая — наш сбой.
const MONGO_UNAVAILABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
]);

export function isHttpClientError(exception: unknown): exception is HttpException {
  if (!(exception instanceof HttpException)) return false;
  const status = exception.getStatus();
  return status >= 400 && status < 500;
}

/** «Базы нет» — временный отказ (503), а не наш сбой; общий для API и браузера. */
export function isMongoUnavailableError(exception: unknown): boolean {
  return exception instanceof Error && MONGO_UNAVAILABLE_ERROR_NAMES.has(exception.name);
}

/** Строка error-лога со стеком и кодом обращения — по нему ищут в логах Railway.
 * Токены в сообщение не попадают: их в запросах к базе нет, только sha256. */
export function logNativeFailure(
  logger: Logger,
  request: RequestLike,
  exception: unknown,
): void {
  const requestId = requestIdOf(request);
  logger.error(
    `Нативный запрос упал (requestId=${requestId ?? '-'}): ${errorMessage(exception)}`,
    errorStack(exception),
  );
}

function nativeErrorCodeOf(exception: unknown): NativeErrorCode {
  if (exception instanceof NativeAuthError) return exception.code;
  if (exception instanceof ThrottlerException) return 'rate_limited';
  // ValidationPipe кидает BadRequestException: любое «не так отправлено» для
  // профиля — invalid_request, подробности клиенту не нужны.
  if (isHttpClientError(exception)) return 'invalid_request';
  if (isMongoUnavailableError(exception)) return 'temporarily_unavailable';
  return 'server_error';
}

@Catch()
export class NativeErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(NativeErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const code = nativeErrorCodeOf(exception);
    if (code === 'server_error') {
      logNativeFailure(this.logger, http.getRequest<RequestLike>(), exception);
    }
    sendNativeError(http.getResponse<NativeResponseLike>(), code);
  }
}
