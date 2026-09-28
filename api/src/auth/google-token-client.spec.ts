// Юнит-тест обмена code→id_token (google-token-client.ts) — global fetch
// подменяется фейком (CLAUDE.md «Тесты»: сети в юнит-тестах нет).
import { GoogleTokenClient } from './google-token-client';
import type { GoogleOAuthConfig } from './google-login-config';

const CONFIG: GoogleOAuthConfig = {
  clientId: 'client.apps.googleusercontent.com',
  clientSecret: 'secret',
  redirectUri: 'https://cabinet.example/login/google',
};

function fakeFetch(impl: (input: string | URL, init?: RequestInit) => Promise<Response>) {
  return jest.fn(impl) as unknown as typeof fetch;
}

describe('GoogleTokenClient.exchange', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('успешный обмен — форма запроса и signal переданы, id_token возвращён', async () => {
    let receivedInit: RequestInit | undefined;
    let receivedUrl: string | URL | undefined;
    global.fetch = fakeFetch((url, init) => {
      receivedUrl = url;
      receivedInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ id_token: 'the-id-token' }), { status: 200 }),
      );
    });

    const client = new GoogleTokenClient();
    const idToken = await client.exchange({
      code: 'auth-code',
      verifier: 'verifier',
      config: CONFIG,
    });

    expect(idToken).toBe('the-id-token');
    expect(receivedUrl).toBe('https://oauth2.googleapis.com/token');
    expect(receivedInit?.method).toBe('POST');
    expect(receivedInit?.signal).toBeInstanceOf(AbortSignal);
    const body = new URLSearchParams(receivedInit?.body as string);
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('client_id')).toBe(CONFIG.clientId);
    expect(body.get('client_secret')).toBe(CONFIG.clientSecret);
    expect(body.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('verifier');
  });

  it('non-2xx ответ — null, без исключения', async () => {
    global.fetch = fakeFetch(() =>
      Promise.resolve(new Response('плохой запрос', { status: 400 })),
    );
    const client = new GoogleTokenClient();

    const idToken = await client.exchange({ code: 'c', verifier: 'v', config: CONFIG });
    expect(idToken).toBeNull();
  });

  it('ответ без id_token — null', async () => {
    global.fetch = fakeFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'x' }), { status: 200 }),
      ),
    );
    const client = new GoogleTokenClient();

    const idToken = await client.exchange({ code: 'c', verifier: 'v', config: CONFIG });
    expect(idToken).toBeNull();
  });

  it('ответ — не JSON — null', async () => {
    global.fetch = fakeFetch(() =>
      Promise.resolve(new Response('не json', { status: 200 })),
    );
    const client = new GoogleTokenClient();

    const idToken = await client.exchange({ code: 'c', verifier: 'v', config: CONFIG });
    expect(idToken).toBeNull();
  });

  it('сетевая ошибка — null, без исключения наружу', async () => {
    global.fetch = fakeFetch(() => Promise.reject(new Error('сеть недоступна')));
    const client = new GoogleTokenClient();

    const idToken = await client.exchange({ code: 'c', verifier: 'v', config: CONFIG });
    expect(idToken).toBeNull();
  });
});
