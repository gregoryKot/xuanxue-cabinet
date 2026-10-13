// Ответы входа из wiki: переход 303 или локальная страница. Как и браузерная
// часть входа Daychi (native-browser-response.ts), это не JSON API: ответ
// несёт сессию или решение о ней, поэтому `no-store` на каждом ответе маршрута.
// Страница — без скриптов и стилей (CSP кабинета их не пустит), подстановок в
// разметке нет: пользовательских данных в ней нет, экранировать нечего.
import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import {
  RETRY_AFTER_HEADER,
  retryAfterSeconds,
  setNoStoreHeaders,
} from '../native-auth/native-response';
import type { WikiEntryOutcome, WikiEntryPageKey } from './wiki-entry';

export interface WikiEntryResponseLike {
  status(code: number): WikiEntryResponseLike;
  setHeader(name: string, value: string | number | string[]): unknown;
  getHeader(name: string): number | string | string[] | undefined;
  end(body?: string): unknown;
}

const UNAVAILABLE_TITLE = 'Не получилось проверить вход';
const UNAVAILABLE_ACTION = 'Подождите минуту и обновите страницу.';

/** Тексты утверждены владельцем; 429 и 503 говорят одно и то же. */
const WIKI_ENTRY_PAGES: Record<WikiEntryPageKey, { title: string; action: string }> = {
  invalid: {
    title: 'Ссылка на wiki не сработала',
    action: 'Вернитесь в wiki и нажмите «Войти» ещё раз.',
  },
  blocked: { title: 'Доступа нет', action: ACCESS_MESSAGE },
  unavailable: { title: UNAVAILABLE_TITLE, action: UNAVAILABLE_ACTION },
};

export const WIKI_ENTRY_INVALID: WikiEntryOutcome = {
  kind: 'page',
  page: 'invalid',
  status: HttpStatus.BAD_REQUEST,
};
export const WIKI_ENTRY_BLOCKED: WikiEntryOutcome = {
  kind: 'page',
  page: 'blocked',
  status: HttpStatus.FORBIDDEN,
};
export const WIKI_ENTRY_UNAVAILABLE: WikiEntryOutcome = {
  kind: 'page',
  page: 'unavailable',
  status: HttpStatus.SERVICE_UNAVAILABLE,
};

export function wikiEntryPageHtml(page: WikiEntryPageKey): string {
  const { title, action } = WIKI_ENTRY_PAGES[page];
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    '</head>',
    '<body>',
    `<h1>${title}</h1>`,
    `<p>${action}</p>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export function sendWikiEntryOutcome(
  res: WikiEntryResponseLike,
  outcome: WikiEntryOutcome,
): void {
  setNoStoreHeaders(res);
  if (outcome.kind === 'page') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(outcome.status).end(wikiEntryPageHtml(outcome.page));
    return;
  }
  if (outcome.cookies) res.setHeader('Set-Cookie', outcome.cookies);
  res.setHeader('Location', outcome.location);
  res.status(HttpStatus.SEE_OTHER).end();
}

/** Только 429 глобального ThrottlerGuard: он срабатывает до обработчика и
 * иначе ушёл бы в общий фильтр с JSON. Остальное сюда не ловится намеренно:
 * 404 локального профиля должен ответить как любой неизвестный адрес, а сбой
 * проверки сервис превращает в 503 сам, с логом. */
@Catch(ThrottlerException)
export class WikiEntryThrottleFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<WikiEntryResponseLike>();
    res.setHeader(RETRY_AFTER_HEADER, retryAfterSeconds(res));
    sendWikiEntryOutcome(res, {
      kind: 'page',
      page: 'unavailable',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  }
}
