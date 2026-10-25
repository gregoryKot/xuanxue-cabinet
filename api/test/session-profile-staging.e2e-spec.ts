// Профиль стейджинга на настоящем AppModule (ADR-0183; контракт Workshop
// web-wiki-session, ревизия 25def59, «production and staging separation»):
// своя cookie `session_staging` на Domain=staging.xuanxue.su; cookie прода
// `session` не читается, не считается повтором и не стирается — гаснет только
// прежняя host-only `session` стейджинга, полем без Domain.
import request from 'supertest';
import { DateTime } from 'luxon';
import { SESSION_RENEW_AFTER_DAYS } from '../src/auth/session-renewal';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import {
  LEGACY_EXPIRATION,
  loginWithTelegram,
  logout,
  setCookies,
} from './e2e-support/session-profile-fixtures';

describe('PUBLIC_URL=https://staging.xuanxue.su (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, {
      PUBLIC_URL: 'https://staging.xuanxue.su',
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function stagingCookie(name: string, issuedAt?: DateTime): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, {
      name,
      roles: [],
      issuedAt,
    });
    return cookie.replace(/^session=/, 'session_staging=');
  }

  it('вход: уборка host-only session без Domain и session_staging на Domain=staging.xuanxue.su', async () => {
    const res = await loginWithTelegram(server());
    expect(res.status).toBe(200);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe(LEGACY_EXPIRATION);
    expect(cookies[1]).toMatch(
      /^session_staging=.+; Domain=staging\.xuanxue\.su; Secure$/,
    );
  });

  it('только cookie session (как у прода) — сессии нет', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Прод',
      roles: [],
    });
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('проверка сессии для Daychi: продление session_staging — одно поле, без уборки host-only', async () => {
    const own = await stagingCookie(
      'Читатель wiki',
      DateTime.utc().minus({ days: SESSION_RENEW_AFTER_DAYS + 1 }),
    );
    const res = await request(server()).get('/api/auth/session').set('Cookie', own);
    expect(res.status).toBe(204);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      /^session_staging=.+; Domain=staging\.xuanxue\.su; Secure$/,
    );
  });

  it('проверка сессии для Daychi: только cookie прода session — 401 с no-store', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Прод',
      roles: [],
    });
    const res = await request(server()).get('/api/auth/session').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(setCookies(res)).toEqual([]);
  });

  it('session_staging рядом с двумя cookie session — читается своя', async () => {
    const own = await stagingCookie('Стейджинг');
    const res = await request(server())
      .get('/api/auth/me')
      .set('Cookie', `session=from-production; ${own}; session=another`);
    expect(res.status).toBe(200);
  });

  it('две session_staging — 401', async () => {
    const own = await stagingCookie('Дважды');
    const res = await request(server())
      .get('/api/auth/me')
      .set('Cookie', `${own}; ${own}`);
    expect(res.status).toBe(401);
  });

  it('выход гасит свою cookie и host-only session, общую cookie прода не трогает', async () => {
    const res = await logout(server());
    expect(res.status).toBe(204);
    const cookies = setCookies(res);
    expect(cookies).toEqual([
      LEGACY_EXPIRATION,
      'session_staging=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Domain=staging.xuanxue.su; Secure',
    ]);
    expect(cookies.some((cookie) => /Domain=xuanxue\.su(;|$)/.test(cookie))).toBe(false);
  });
});
