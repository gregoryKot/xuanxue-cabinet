// Единая точка перевода любой ошибки в HTTP-ответ (правило CLAUDE.md
// «Ошибки»): доменная ошибка → её статус/код, HttpException (в т.ч.
// ValidationPipe и троттлер, оба кидают HttpException) → её статус,
// всё остальное → 500 с логом стека и нейтральным текстом для пользователя —
// стек и текст исключения наружу не идут. Неизвестная ошибка (500) ещё уходит
// админу в Telegram — AppErrorAlerts (ТЗ владельца «а куда приходят ошибки?»),
// через порт из этого же common/, чтобы фильтр не зависел от TelegramModule
// напрямую (тот же приём, что deliveries/teacher-notifier.ts).
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Logger } from 'nestjs-pino';
import type { ApiErrorBody } from '@xuanxue/shared';
import { APP_ERROR_ALERTS, type AppErrorAlerts } from './app-error-alerts';
import { errorMessage, errorStack } from './error-info';
import { DomainError } from './errors';
import { fromHttpException } from './http-exception.mapper';

const GENERIC_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз через минуту.';
// Лимит тела (JSON 1 МБ, картинка экзамена — ADR-0035): текст один на оба случая.
const PAYLOAD_TOO_LARGE_MESSAGE =
  'Файл или текст больше допустимого. Уменьшите его и попробуйте ещё раз.';

// Минимальные интерфейсы вместо @types/express (которого нет в зависимостях
// api/) — фильтру нужны `req.id` (пишет pino-http, см. logging.module.ts),
// `req.method`/`req.url` (метод и путь для алёрта админу, см. notifyAppError)
// и express-подобный `res.status().json()`.
interface RequestLike {
  id?: unknown;
  method?: unknown;
  url?: unknown;
}
interface ResponseLike {
  status(code: number): { json(body: ApiErrorBody): unknown };
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(
    // Явный токен вместо типа-интерфейса в сигнатуре: nestjs-pino Logger —
    // не interface, а конкретный класс, но зависеть в подписи от неё не хочется.
    @Inject(Logger) private readonly logger: Logger,
    // @Optional(): без реализации (юнит-тесты этого фильтра, часть e2e без
    // TelegramModule) фильтр обязан работать как раньше — алёрт админу
    // довесок к ответу, а не обязательное звено.
    @Optional()
    @Inject(APP_ERROR_ALERTS)
    private readonly appErrorAlerts?: AppErrorAlerts,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<RequestLike>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const body = this.toBody(exception, requestId);
    // 'internal_error' — код ровно той ветки toBody() ниже, что не смогла
    // распознать ошибку (не DomainError, не HttpException, не entity.too.large)
    // — остальные коды сюда не приходят, отдельного флага не нужно.
    if (body.code === 'internal_error') {
      this.notifyAppError(request, requestId, exception);
    }
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
    // body-parser даёт лимит тела как http-errors Error с полями status/type,
    // не HttpException — mapExternalException её не оборачивает, ловим сами.
    if (
      exception instanceof Error &&
      (exception as { type?: unknown }).type === 'entity.too.large'
    ) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'payload_too_large',
        message: PAYLOAD_TOO_LARGE_MESSAGE,
        requestId,
      };
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

  /** Не должна задерживать или ломать ответ пользователю (CLAUDE.md
   * «Ошибки»): зовём без await ответа клиенту, отказ порта ловим сами и
   * пишем в лог, не бросаем дальше. */
  private notifyAppError(
    request: RequestLike,
    requestId: string | undefined,
    exception: unknown,
  ): void {
    if (!this.appErrorAlerts) return;
    const method = typeof request.method === 'string' ? request.method : '-';
    const url = typeof request.url === 'string' ? request.url : undefined;
    const path = url === undefined ? '-' : pathWithoutQuery(url);
    const context = { requestId, method, path, message: errorMessage(exception) };
    this.appErrorAlerts
      .notifyServerError(context, DateTime.utc())
      .catch((err: unknown) => {
        this.logger.error(
          `app_error alert: не удалось уведомить админа (requestId=${requestId ?? '-'}): ${errorMessage(err)}`,
        );
      });
  }
}

// Путь без query-строки: там бывают токены входа (?join=, ?token=, SECURITY
// §6) — редакция лога вырезает их поштучно (request-serializer.ts), а этот
// путь идёт не в лог, а в текст алёрта админу, проще убрать query целиком.
function pathWithoutQuery(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
