import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Logger } from 'nestjs-pino';
import type { ApiErrorBody } from '@xuanxue/shared';
import type { AppErrorAlertContext, AppErrorAlerts } from './app-error-alerts';
import { DomainExceptionFilter } from './domain-exception.filter';
import { ConflictError, NotAvailableError, NotFoundError } from './errors';

// Простые типизированные заглушки вместо jest.fn(): jest.Mock без явных
// generics даёт `any` на .mock.calls[…] (eslint no-unsafe-member-access) —
// закрытые переменные + типизированные функции проще и без потери контроля.
// `request` — метод/путь для алёрта админу (AppErrorAlerts ниже); остальные
// тесты его не передают, фильтру они не нужны.
function buildHost(
  requestId?: string,
  request: { method?: string; url?: string } = {},
): {
  host: ArgumentsHost;
  getStatusCode: () => number | undefined;
  getJsonBody: () => ApiErrorBody | undefined;
} {
  let statusCode: number | undefined;
  let jsonBody: ApiErrorBody | undefined;
  const json = (body: ApiErrorBody): void => {
    jsonBody = body;
  };
  const status = (code: number): { json: typeof json } => {
    statusCode = code;
    return { json };
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: requestId, ...request }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, getStatusCode: () => statusCode, getJsonBody: () => jsonBody };
}

function buildLogger(): {
  logger: Logger;
  errorCalls: Array<{ message: string; stack?: string }>;
} {
  const errorCalls: Array<{ message: string; stack?: string }> = [];
  const error = (message: string, stack?: string): void => {
    errorCalls.push({ message, stack });
  };
  return { logger: { error } as unknown as Logger, errorCalls };
}

// Фейк AppErrorAlerts — сам факт и содержимое вызова, без Telegram/PersonalChats
// (те — telegram-app-error-alerts.spec.ts). `notifyServerError` — простая
// типизированная функция, не jest.fn(): та же причина, что у buildLogger выше.
// `rejectWith` — для теста «отказ порта не ломает ответ 500».
function buildAppErrorAlerts(rejectWith?: Error): {
  appErrorAlerts: AppErrorAlerts;
  calls: AppErrorAlertContext[];
} {
  const calls: AppErrorAlertContext[] = [];
  const notifyServerError = (context: AppErrorAlertContext): Promise<void> => {
    calls.push(context);
    return rejectWith ? Promise.reject(rejectWith) : Promise.resolve();
  };
  return { appErrorAlerts: { notifyServerError }, calls };
}

describe('DomainExceptionFilter', () => {
  it('доменная ошибка → её статус и код, без обращения к логгеру', () => {
    const { logger, errorCalls } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-1');

    filter.catch(new NotFoundError('Занятие не найдено'), host);

    expect(getStatusCode()).toBe(404);
    expect(getJsonBody()).toEqual({
      statusCode: 404,
      code: 'not_found',
      message: 'Занятие не найдено',
      requestId: 'req-1',
    });
    expect(errorCalls).toHaveLength(0);
  });

  it('другая доменная ошибка (ConflictError) тоже маппится по своему статусу', () => {
    const { logger } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost();

    filter.catch(new ConflictError('Уже отправлено'), host);

    expect(getStatusCode()).toBe(409);
    expect(getJsonBody()).toEqual({
      statusCode: 409,
      code: 'conflict',
      message: 'Уже отправлено',
      requestId: undefined,
    });
  });

  it('NotAvailableError (вход через Telegram без BOT_TOKEN) → 503 в конверте', () => {
    const { logger, errorCalls } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-4');

    filter.catch(
      new NotAvailableError(
        'Вход через Telegram пока не подключён. Попросите администратора включить его',
      ),
      host,
    );

    expect(getStatusCode()).toBe(503);
    expect(getJsonBody()).toEqual({
      statusCode: 503,
      code: 'not_available',
      message:
        'Вход через Telegram пока не подключён. Попросите администратора включить его',
      requestId: 'req-4',
    });
    expect(errorCalls).toHaveLength(0);
  });

  it('HttpException с массивом message (ValidationPipe) → details[]', () => {
    const { logger } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-2');

    filter.catch(
      new BadRequestException(['title должен быть строкой', 'time обязателен']),
      host,
    );

    expect(getStatusCode()).toBe(400);
    expect(getJsonBody()).toEqual({
      statusCode: 400,
      code: 'invalid_input',
      message: 'Проверьте, пожалуйста, введённые данные.',
      details: ['title должен быть строкой', 'time обязателен'],
      requestId: 'req-2',
    });
  });

  it('ThrottlerException (429) → русский текст константой, не английский из библиотеки', () => {
    const { logger, errorCalls } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-5');

    filter.catch(new ThrottlerException(), host);

    expect(getStatusCode()).toBe(429);
    expect(getJsonBody()).toEqual({
      statusCode: 429,
      code: 'rate_limited',
      message: 'Слишком много запросов. Подождите минуту и попробуйте ещё раз.',
      requestId: 'req-5',
    });
    expect(errorCalls).toHaveLength(0);
  });

  it('обычный HttpException (не валидационный) → свой статус и текст', () => {
    const { logger } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost();

    filter.catch(new ForbiddenException('Нет доступа к занятию'), host);

    expect(getStatusCode()).toBe(403);
    expect(getJsonBody()).toEqual({
      statusCode: 403,
      code: 'forbidden',
      message: 'Нет доступа к занятию',
      requestId: undefined,
    });
  });

  it('тело больше лимита (body-parser 413) → конверт по-русски, без обращения к логгеру', () => {
    const { logger, errorCalls } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-6');

    const bodyParserError = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    filter.catch(bodyParserError, host);

    expect(getStatusCode()).toBe(413);
    expect(getJsonBody()).toEqual({
      statusCode: 413,
      code: 'payload_too_large',
      message: 'Файл или текст больше допустимого. Уменьшите его и попробуйте ещё раз.',
      requestId: 'req-6',
    });
    expect(errorCalls).toHaveLength(0);
  });

  it('непредвиденная ошибка → 500, нейтральный текст, стек уходит в логгер, а не в ответ', () => {
    const { logger, errorCalls } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-3');

    filter.catch(new Error('connection refused: mongodb://secret@host'), host);

    expect(getStatusCode()).toBe(500);
    const body = getJsonBody();
    expect(body).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: 'Что-то пошло не так. Попробуйте ещё раз через минуту.',
      requestId: 'req-3',
    });
    expect(JSON.stringify(body)).not.toContain('mongodb://secret@host');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toContain('req-3');
  });

  it('непредвиденная не-Error (строка/число) тоже не роняет фильтр', () => {
    const { logger } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost();

    filter.catch('строковый throw', host);

    expect(getStatusCode()).toBe(500);
    expect(getJsonBody()).toMatchObject({ code: 'internal_error' });
  });
});

// AppErrorAlerts — ТЗ владельца «а куда приходят ошибки?» (CLAUDE.md
// «Ошибки»): только неизвестная ошибка (500) зовёт порт, доменные и 4xx —
// нормальная работа, уведомление не нужно. `@Optional()` без реализации —
// отдельная группа, чтобы явно показать: без порта фильтр не меняет поведение.
describe('DomainExceptionFilter — алёрт админу (AppErrorAlerts)', () => {
  it('неизвестная ошибка → зовёт порт с requestId, методом и путём без query, без текста исключения', () => {
    const { logger } = buildLogger();
    const { appErrorAlerts, calls } = buildAppErrorAlerts();
    const filter = new DomainExceptionFilter(logger, appErrorAlerts);
    const { host, getStatusCode } = buildHost('req-7', {
      method: 'POST',
      url: '/api/lessons/1/recording?token=secret',
    });

    filter.catch(new Error('TypeError: x is undefined'), host);

    expect(getStatusCode()).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      requestId: 'req-7',
      method: 'POST',
      path: '/api/lessons/1/recording',
      message: 'TypeError: x is undefined',
    });
  });

  it('нет method/url на запросе — контекст с «-», не падает', () => {
    const { logger } = buildLogger();
    const { appErrorAlerts, calls } = buildAppErrorAlerts();
    const filter = new DomainExceptionFilter(logger, appErrorAlerts);
    const { host } = buildHost('req-13');

    filter.catch(new Error('boom'), host);

    expect(calls[0]).toMatchObject({ method: '-', path: '-' });
  });

  it('доменная ошибка (NotFoundError) — не зовёт порт, это не сбой сервера', () => {
    const { logger } = buildLogger();
    const { appErrorAlerts, calls } = buildAppErrorAlerts();
    const filter = new DomainExceptionFilter(logger, appErrorAlerts);
    const { host } = buildHost('req-8', { method: 'GET', url: '/api/x' });

    filter.catch(new NotFoundError('Занятие не найдено'), host);

    expect(calls).toHaveLength(0);
  });

  it('4xx (ValidationPipe, троттлер, обычный HttpException) — не зовут порт', () => {
    const { logger } = buildLogger();
    const { appErrorAlerts, calls } = buildAppErrorAlerts();
    const filter = new DomainExceptionFilter(logger, appErrorAlerts);
    const { host } = buildHost('req-9', { method: 'POST', url: '/api/x' });

    filter.catch(new BadRequestException(['x обязателен']), host);
    filter.catch(new ThrottlerException(), host);
    filter.catch(new ForbiddenException('Нет доступа'), host);

    expect(calls).toHaveLength(0);
  });

  it('413 (тело больше лимита) — не зовёт порт', () => {
    const { logger } = buildLogger();
    const { appErrorAlerts, calls } = buildAppErrorAlerts();
    const filter = new DomainExceptionFilter(logger, appErrorAlerts);
    const { host } = buildHost('req-10', { method: 'POST', url: '/api/x' });

    const bodyParserError = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    filter.catch(bodyParserError, host);

    expect(calls).toHaveLength(0);
  });

  it('порт отказал (Promise.reject) — ответ 500 всё равно уходит, отказ уходит в лог', async () => {
    const { logger, errorCalls } = buildLogger();
    const { appErrorAlerts } = buildAppErrorAlerts(new Error('telegram недоступен'));
    const filter = new DomainExceptionFilter(logger, appErrorAlerts);
    const { host, getStatusCode, getJsonBody } = buildHost('req-11', {
      method: 'GET',
      url: '/api/x',
    });

    expect(() => filter.catch(new Error('boom'), host)).not.toThrow();
    // Один microtask-тик — дать отработать .catch() у fire-and-forget вызова
    // (notifyAppError не await'ится ответом пользователю, CLAUDE.md «Ошибки»).
    await Promise.resolve();

    expect(getStatusCode()).toBe(500);
    expect(getJsonBody()).toMatchObject({ code: 'internal_error' });
    // Один лог — стек неизвестной ошибки (как всегда), второй — отказ самого
    // порта уведомления: оба видны разработчику, ни один не долетает до ответа.
    expect(errorCalls).toHaveLength(2);
    expect(errorCalls[1]?.message).toContain('req-11');
    expect(errorCalls[1]?.message).toContain('не удалось уведомить');
  });

  it('без AppErrorAlerts (@Optional() ничего не внедрил) — фильтр работает как раньше', () => {
    const { logger, errorCalls } = buildLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, getStatusCode, getJsonBody } = buildHost('req-12', {
      method: 'GET',
      url: '/api/x',
    });

    expect(() => filter.catch(new Error('boom'), host)).not.toThrow();

    expect(getStatusCode()).toBe(500);
    expect(getJsonBody()).toMatchObject({ code: 'internal_error' });
    expect(errorCalls).toHaveLength(1);
  });
});
