// Юнит-тест общего POST на token endpoint (oauth-token-request.ts) — global
// fetch подменяется фейком (CLAUDE.md «Тесты»: сети в юнит-тестах нет).
// Форму запросов Google и Telegram проверяют спеки их клиентов.
import type { Logger } from '@nestjs/common';
import { requestIdToken } from './oauth-token-request';

const ENDPOINT = 'https://idp.example/token';

function fakeLogger(): { logger: Logger; errors: string[] } {
  const errors: string[] = [];
  const logger = {
    error: (message: string) => errors.push(message),
  } as unknown as Logger;
  return { logger, errors };
}

function request(logger: Logger, headers?: Record<string, string>) {
  return requestIdToken(logger, {
    provider: 'Демо',
    endpoint: ENDPOINT,
    headers,
    body: new URLSearchParams({ code: 'secret-code' }),
  });
}

describe('requestIdToken', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('успех — id_token возвращён, signal и Content-Type переданы, заголовки клиента добавлены', async () => {
    let receivedInit: RequestInit | undefined;
    global.fetch = jest.fn((_url: string | URL, init?: RequestInit) => {
      receivedInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ id_token: 'the-token' }), { status: 200 }),
      );
    }) as unknown as typeof fetch;

    const { logger, errors } = fakeLogger();
    const idToken = await request(logger, { Authorization: 'Basic abc' });

    expect(idToken).toBe('the-token');
    expect(receivedInit?.method).toBe('POST');
    expect(receivedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(receivedInit?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic abc',
    });
    expect(receivedInit?.body).toBe('code=secret-code');
    expect(errors).toEqual([]);
  });

  it('non-2xx — null, в лог идёт статус, а не тело ответа и не код', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('echo secret-code', { status: 401 })),
    );
    const { logger, errors } = fakeLogger();

    expect(await request(logger)).toBeNull();
    expect(errors).toEqual(['Демо token endpoint ответил 401']);
    expect(errors.join()).not.toContain('secret-code');
  });

  it('ответ без id_token — null и строка в лог', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'x' }), { status: 200 }),
      ),
    );
    const { logger, errors } = fakeLogger();

    expect(await request(logger)).toBeNull();
    expect(errors).toEqual(['Демо token endpoint не вернул id_token']);
  });

  it('ответ не JSON — null', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('не json', { status: 200 })),
    );
    const { logger } = fakeLogger();

    expect(await request(logger)).toBeNull();
  });

  it('id_token не строка — null', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id_token: 5 }), { status: 200 })),
    );
    const { logger } = fakeLogger();

    expect(await request(logger)).toBeNull();
  });

  it('сетевая ошибка или таймаут — null, исключения наружу нет', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new DOMException('The operation timed out', 'TimeoutError')),
    );
    const { logger, errors } = fakeLogger();

    expect(await request(logger)).toBeNull();
    expect(errors[0]).toContain('Демо token endpoint недоступен');
  });
});
