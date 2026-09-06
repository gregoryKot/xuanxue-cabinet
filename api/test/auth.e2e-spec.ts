// e2e на /auth/me и /auth/logout через настоящий AppModule (ADR-0012,
// SECURITY §2). Гвард — глобальный APP_GUARD, поэтому эти сценарии
// одновременно проверяют его на реальном HTTP-стеке (пайпы/фильтры/CSRF).
import request from 'supertest';
import { DateTime } from 'luxon';
import type { ApiErrorBody, MeDto } from '@xuanxue/shared';
import { SESSION_RENEW_AFTER_DAYS } from '../src/auth/session-renewal';
import { SESSION_MAX_AGE_DAYS } from '../src/auth/session-token';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';

describe('Auth (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('GET /auth/me без cookie — 401 в конверте с code unauthorized', async () => {
    const res = await request(server()).get('/api/auth/me');
    expect(res.status).toBe(401);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('unauthorized');
  });

  it('GET /auth/me с валидной cookie — MeDto без email/telegramId/status', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Мария',
      roles: ['admin'],
    });

    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = res.body as MeDto & Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Мария', roles: ['admin'] });
    expect(body.email).toBeUndefined();
    expect(body.telegramId).toBeUndefined();
    expect(body.status).toBeUndefined();
  });

  it('заблокированный пользователь — 403', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Заблокированный',
      roles: ['teacher'],
      status: 'blocked',
    });

    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('протухший токен (issuedAt за пределом SESSION_MAX_AGE_DAYS) — 401', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Давний',
      roles: ['student'],
      issuedAt: DateTime.utc().minus({ days: SESSION_MAX_AGE_DAYS + 1 }),
    });

    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('токен старше SESSION_RENEW_AFTER_DAYS, но валидный — гвард перевыпускает cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Давно не заходил',
      roles: ['student'],
      issuedAt: DateTime.utc().minus({ days: SESSION_RENEW_AFTER_DAYS + 1 }),
    });

    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).not.toContain('Max-Age=0');
  });

  it('битая подпись (символ токена изменён) — 401', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Подделка',
      roles: ['student'],
    });
    const [name, token] = cookie.split('=');
    // Меняем предпоследний символ, не последний: у base64url последний символ
    // хвостовой группы из 32 байт несёт 2 бита паддинга, которые декодер
    // отбрасывает — иногда другая буква декодируется в тот же байт, и подпись
    // «портится» не всегда (флейки). Предпоследний символ таких пустых битов
    // не имеет — любая другая буква там меняет байт гарантированно.
    const body = token?.slice(0, -1) ?? '';
    const target = body.slice(-1);
    const tamperedBody = `${body.slice(0, -1)}${target === 'a' ? 'b' : 'a'}`;
    const tamperedToken = `${tamperedBody}${token?.slice(-1) ?? ''}`;
    const tamperedCookie = `${name}=${tamperedToken}`;

    const res = await request(server()).get('/api/auth/me').set('Cookie', tamperedCookie);
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout без x-requested-with — 403', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Без заголовка',
      roles: ['student'],
    });

    const res = await request(server()).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('logout с заголовком — 204 и Set-Cookie с Max-Age=0; дальше /auth/me — 401', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Выходит',
      roles: ['student'],
    });

    const logoutRes = await request(server())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('x-requested-with', 'fetch');
    expect(logoutRes.status).toBe(204);
    const clearedSetCookie = logoutRes.headers['set-cookie'];
    expect(String(clearedSetCookie)).toContain('Max-Age=0');

    // Браузер после Set-Cookie с Max-Age=0 больше не шлёт эту cookie —
    // подставляем то же значение (пустое), что получил бы реальный клиент.
    const clearedCookie = String(clearedSetCookie).split(';')[0] ?? '';
    const meRes = await request(server())
      .get('/api/auth/me')
      .set('Cookie', clearedCookie);
    expect(meRes.status).toBe(401);
  });

  it('logout без cookie, но с заголовком — 204 и Set-Cookie с Max-Age=0 (@Public(), чистит протухшую cookie)', async () => {
    const res = await request(server())
      .post('/api/auth/logout')
      .set('x-requested-with', 'fetch');

    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
  });
});
