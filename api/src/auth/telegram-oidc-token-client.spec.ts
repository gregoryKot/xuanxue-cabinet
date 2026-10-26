// Юнит-тест обмена code→id_token у Telegram (telegram-oidc-token-client.ts) —
// global fetch подменяется фейком (CLAUDE.md «Тесты»: сети в юнит-тестах нет).
// Общую сетевую часть (не-JSON, нет id_token) проверяет oauth-token-request.spec.ts.
import { TelegramOidcTokenClient } from './telegram-oidc-token-client';
import type { TelegramOidcConfig } from './telegram-oidc-config';

const CONFIG: TelegramOidcConfig = {
  clientId: '123456',
  clientSecret: 'client-secret-value',
  redirectUri: 'https://cabinet.example/login/telegram',
};

describe('TelegramOidcTokenClient.exchange', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('успех — форма запроса по документации Telegram, id_token возвращён', async () => {
    let receivedUrl: string | URL | undefined;
    let receivedInit: RequestInit | undefined;
    global.fetch = jest.fn((url: string | URL, init?: RequestInit) => {
      receivedUrl = url;
      receivedInit = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'at',
            token_type: 'Bearer',
            expires_in: 3600,
            id_token: 'the-id-token',
          }),
          { status: 200 },
        ),
      );
    }) as unknown as typeof fetch;

    const idToken = await new TelegramOidcTokenClient().exchange({
      code: 'auth-code',
      verifier: 'verifier',
      config: CONFIG,
    });

    expect(idToken).toBe('the-id-token');
    expect(receivedUrl).toBe('https://oauth.telegram.org/token');
    expect(receivedInit?.method).toBe('POST');
    expect(receivedInit?.signal).toBeInstanceOf(AbortSignal);
    const headers = receivedInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const basic = Buffer.from('123456:client-secret-value').toString('base64');
    expect(headers.Authorization).toBe(`Basic ${basic}`);
    const body = new URLSearchParams(receivedInit?.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: 'https://cabinet.example/login/telegram',
      client_id: '123456',
      code_verifier: 'verifier',
    });
  });

  it('client_secret в теле не отправляется — только в Authorization', async () => {
    let receivedBody = '';
    global.fetch = jest.fn((_url: string | URL, init?: RequestInit) => {
      receivedBody = init?.body as string;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;

    await new TelegramOidcTokenClient().exchange({
      code: 'c',
      verifier: 'v',
      config: CONFIG,
    });

    expect(receivedBody).not.toContain('client-secret-value');
    expect(receivedBody).not.toContain('client_secret');
  });

  it('non-2xx ответ — null, без исключения', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('{"error":"invalid_client"}', { status: 401 })),
    );

    const idToken = await new TelegramOidcTokenClient().exchange({
      code: 'c',
      verifier: 'v',
      config: CONFIG,
    });
    expect(idToken).toBeNull();
  });

  it('ответ без id_token — null', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'x' }), { status: 200 }),
      ),
    );

    const idToken = await new TelegramOidcTokenClient().exchange({
      code: 'c',
      verifier: 'v',
      config: CONFIG,
    });
    expect(idToken).toBeNull();
  });

  it('таймаут запроса — null, исключения наружу нет', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new DOMException('The operation timed out', 'TimeoutError')),
    );

    const idToken = await new TelegramOidcTokenClient().exchange({
      code: 'c',
      verifier: 'v',
      config: CONFIG,
    });
    expect(idToken).toBeNull();
  });
});
