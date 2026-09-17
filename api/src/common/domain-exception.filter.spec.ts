import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Logger } from 'nestjs-pino';
import { DomainExceptionFilter } from './domain-exception.filter';
import { ConflictError, NotAvailableError, NotFoundError } from './errors';
import type { ApiErrorBody } from '@xuanxue/shared';

// Простые типизированные заглушки вместо jest.fn(): jest.Mock без явных
// generics даёт `any` на .mock.calls[…] (eslint no-unsafe-member-access) —
// закрытые переменные + типизированные функции проще и без потери контроля.
function buildHost(requestId?: string): {
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
      getRequest: () => ({ id: requestId }),
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
