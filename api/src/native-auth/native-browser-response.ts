// Ответы браузерной части входа Daychi (ADR-0181): локальная страница «начните
// заново» и переход 302. Это не JSON API, поэтому не native-response.ts, но
// заголовки те же: адрес с кодом и страница не кешируются ни браузером, ни
// прокси. Страница — без скриптов и стилей: CSP кабинета их не пустит, а
// показать нужно одну фразу. Подстановок в разметке нет, экранировать нечего.
import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { RequestLike } from '../common/request-info';
import { isHttpClientError, logNativeFailure } from './native-error.filter';
import {
  RETRY_AFTER_HEADER,
  retryAfterSeconds,
  setNoStoreHeaders,
} from './native-response';

export interface NativeBrowserResponseLike {
  status(code: number): NativeBrowserResponseLike;
  setHeader(name: string, value: string | number): unknown;
  getHeader(name: string): number | string | string[] | undefined;
  end(body?: string): unknown;
}

export type NativeBrowserOutcome =
  | { kind: 'page'; status: number }
  | { kind: 'redirect'; location: string; cookie?: string };

const PAGE_TITLE = 'Вход в Daychi прервался';
const PAGE_ACTION = 'Вернитесь в приложение Daychi и начните вход заново.';

export const NATIVE_BAD_REQUEST_PAGE: NativeBrowserOutcome = {
  kind: 'page',
  status: HttpStatus.BAD_REQUEST,
};

export function nativeBrowserPageHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${PAGE_TITLE}</title>`,
    '</head>',
    '<body>',
    `<h1>${PAGE_TITLE}</h1>`,
    `<p>${PAGE_ACTION}</p>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export function redirectTo(location: string): NativeBrowserOutcome {
  return { kind: 'redirect', location };
}

export function sendNativeBrowserOutcome(
  res: NativeBrowserResponseLike,
  outcome: NativeBrowserOutcome,
): void {
  setNoStoreHeaders(res);
  if (outcome.kind === 'page') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(outcome.status).end(nativeBrowserPageHtml());
    return;
  }
  if (outcome.cookie) res.setHeader('Set-Cookie', outcome.cookie);
  res.setHeader('Location', outcome.location);
  res.status(HttpStatus.FOUND).end();
}

/** Исключения, вылетевшие из браузерного маршрута до обработчика, — в том числе
 * 429 глобального ThrottlerGuard: в callback их не отправить (state ещё не
 * проверен), поэтому та же локальная страница. Неизвестный сбой — 500 и
 * error-лог: человек видит ту же фразу, причина — в логе по requestId. */
@Catch()
export class NativeBrowserPageFilter implements ExceptionFilter {
  private readonly logger = new Logger(NativeBrowserPageFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<NativeBrowserResponseLike>();
    if (exception instanceof ThrottlerException) {
      res.setHeader(RETRY_AFTER_HEADER, retryAfterSeconds(res));
      sendNativeBrowserOutcome(res, {
        kind: 'page',
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      return;
    }
    if (isHttpClientError(exception)) {
      sendNativeBrowserOutcome(res, NATIVE_BAD_REQUEST_PAGE);
      return;
    }
    logNativeFailure(this.logger, http.getRequest<RequestLike>(), exception);
    sendNativeBrowserOutcome(res, {
      kind: 'page',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
