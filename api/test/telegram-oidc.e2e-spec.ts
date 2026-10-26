// e2e входа через Telegram по OpenID Connect (ADR-0187): старт, конфигурация и
// отказы. Вход целиком — telegram-oidc-login.e2e-spec.ts. Настоящий AppModule на
// MongoMemoryServer, TelegramOidcTokenClient подменён фейком
// (e2e-support/telegram-oidc-fixtures.ts). TELEGRAM_LOGIN_CLIENT_SECRET — через
// envOverrides (BOT_TOKEN и PUBLIC_URL уже стоят в setTestEnv(), create-app.ts).
import request from 'supertest';
import {
  TELEGRAM_LOGIN_FAILED_MESSAGE,
  type ApiErrorBody,
  type AuthConfigDto,
} from '@xuanxue/shared';
import { codeChallenge } from '../src/auth/google-oauth-pkce';
import { readTelegramOAuthCookie } from '../src/auth/telegram-oidc-cookie';
import { TelegramOidcTokenClient } from '../src/auth/telegram-oidc-token-client';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  createTelegramOidcHarness,
  oauthCookieFrom,
  setCookiesOf,
} from './e2e-support/telegram-oidc-fixtures';

describe('Telegram login по OIDC: старт и отказы (e2e)', () => {
  let testApp: TestApp;
  const harness = createTelegramOidcHarness(() => testApp);
  const { server, users, newAgent, loginFlow } = harness;

  beforeAll(async () => {
    testApp = await createTestApp(
      (builder) => {
        builder
          .overrideProvider(TelegramOidcTokenClient)
          .useValue(harness.tokenClientFake);
      },
      { TELEGRAM_LOGIN_CLIENT_SECRET: OIDC_CLIENT_SECRET },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    harness.reset();
  });

  it('GET /auth/config — telegramOidcEnabled: true, когда секрет задан', async () => {
    const res = await request(server()).get('/api/auth/config');

    expect((res.body as AuthConfigDto).telegramOidcEnabled).toBe(true);
  });

  it('GET start — 302 на oauth.telegram.org с параметрами OIDC и PKCE S256, Set-Cookie telegram_oauth', async () => {
    const res = await request(server()).get('/api/auth/telegram/oidc/start');

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://oauth.telegram.org/auth',
    );
    const params = location.searchParams;
    expect(params.get('client_id')).toBe(OIDC_CLIENT_ID);
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/login/telegram');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('openid profile telegram:bot_access');
    expect(params.get('code_challenge_method')).toBe('S256');

    const cookie = oauthCookieFrom(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/telegram/oidc');
    const stored = readTelegramOAuthCookie(cookie.split(';')[0]);
    expect(params.get('state')).toBe(stored?.state);
    expect(params.get('code_challenge')).toBe(codeChallenge(stored?.verifier ?? ''));
  });

  it('POST без cookie заявки — 401 с общим текстом', async () => {
    const res = await withCsrf(request(server()).post('/api/auth/telegram/oidc')).send({
      code: 'x'.repeat(20),
      state: 'a'.repeat(43),
    });

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).message).toBe(TELEGRAM_LOGIN_FAILED_MESSAGE);
    expect(harness.lastExchange()).toBeNull();
  });

  it('POST с неверным state — 401, в Telegram за токеном не ходили', async () => {
    const start = await request(server()).get('/api/auth/telegram/oidc/start');

    const res = await withCsrf(request(server()).post('/api/auth/telegram/oidc'))
      .set('Cookie', oauthCookieFrom(start))
      .send({ code: 'x'.repeat(20), state: 'b'.repeat(43) });

    expect(res.status).toBe(401);
    expect(harness.lastExchange()).toBeNull();
  });

  it('POST без x-requested-with — 403 (CSRF)', async () => {
    const start = await request(server()).get('/api/auth/telegram/oidc/start');

    const res = await request(server())
      .post('/api/auth/telegram/oidc')
      .set('Cookie', oauthCookieFrom(start))
      .send({ code: 'x'.repeat(20), state: 'a'.repeat(43) });

    expect(res.status).toBe(403);
  });

  it('POST с телом неверного формата — 400, а не поход в Telegram', async () => {
    const res = await withCsrf(request(server()).post('/api/auth/telegram/oidc')).send({
      code: 'коротко',
      state: 'a'.repeat(43),
    });

    expect(res.status).toBe(400);
    expect(harness.lastExchange()).toBeNull();
  });

  it('Telegram отказал в обмене кода — 401, сессии нет', async () => {
    const agent = newAgent();
    const start = await agent.get('/api/auth/telegram/oidc/start');
    const stored = readTelegramOAuthCookie(oauthCookieFrom(start).split(';')[0]);
    harness.respondWith(null);

    const res = await withCsrf(agent.post('/api/auth/telegram/oidc')).send({
      code: 'authorization-code-value',
      state: stored?.state,
    });

    expect(res.status).toBe(401);
    expect(harness.lastExchange()).not.toBeNull();
    expect(setCookiesOf(res).some((c) => c.startsWith('session='))).toBe(false);
  });

  it('id_token от чужого клиента (aud) — 401, аккаунт не открывается', async () => {
    await users().create({
      name: 'Чужой aud',
      telegramId: 111_222_333,
      roles: [],
      status: 'active',
    });

    const { login } = await loginFlow(newAgent(), { id: 111_222_333, aud: '999' });

    expect(login.status).toBe(401);
    expect(setCookiesOf(login).some((c) => c.startsWith('session='))).toBe(false);
  });
});
