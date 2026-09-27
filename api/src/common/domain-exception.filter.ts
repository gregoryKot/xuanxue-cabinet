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
import { Logger } from 'nestjs-pino';
import type { ApiErrorBody } from '@xuanxue/shared';
import { APP_ERROR_ALERTS, type AppErrorAlerts } from './app-error-alerts';
import { APP_ERROR_JOURNAL, type AppErrorJournal } from './app-error-journal';
import { reportUnknownError } from './unknown-error-report';
import { fromBodyParserError, isBodyParserError } from './body-parser-error.mapper';
import { errorMessage, errorStack } from './error-info';
import { DomainError } from './errors';
import { fromHttpException } from './http-exception.mapper';
import { requestIdOf, type RequestLike } from './request-info';

const GENERIC_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз через минуту.';

// Минимальный интерфейс вместо @types/express (которого нет в зависимостях
// api/): фильтру нужен express-подобный `res.status().json()`. Что берётся из
// запроса — common/request-info.ts (тот же модуль читает ClientErrorsController).
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
    // @Optional(): та же причина, что у appErrorAlerts выше — без
    // AppErrorsModule (юнит-тесты фильтра) поведение не меняется.
    @Optional()
    @Inject(APP_ERROR_JOURNAL)
    private readonly appErrorJournal?: AppErrorJournal,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<RequestLike>();
    const requestId = requestIdOf(request);

    const body = this.toBody(exception, requestId);
    // 'internal_error' — код ровно той ветки toBody() ниже, что не смогла
    // распознать ошибку (не DomainError, не HttpException, не entity.too.large)
    // — остальные коды сюда не приходят, отдельного флага не нужно.
    if (body.code === 'internal_error') {
      reportUnknownError(
        {
          logger: this.logger,
          alerts: this.appErrorAlerts,
          journal: this.appErrorJournal,
        },
        { request, requestId, exception },
      );
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
    // body-parser даёт свои ошибки (лимит тела, битый JSON, неподдерживаемый
    // charset) как http-errors Error с полями status/type, не HttpException —
    // mapExternalException её не оборачивает, ловим сами (body-parser-error.mapper.ts).
    if (exception instanceof Error && isBodyParserError(exception)) {
      // entity.too.large — заранее ожидаемый отказ (лимит известен и назван
      // пользователю), остальные типы — неожиданный битый ввод: не сбой
      // сервера (алёрта нет), но и не тихо — warn виден в логах Railway.
      if (exception.type !== 'entity.too.large') {
        this.logger.warn(
          `Тело запроса не распознано (requestId=${requestId ?? '-'}, type=${exception.type}): ${errorMessage(exception)}`,
        );
      }
      return fromBodyParserError(exception, requestId);
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
