// Профиль прода на настоящем AppModule (ADR-0183; контракт Workshop
// web-wiki-session, ревизия 25def59): общая cookie `session` на
// Domain=xuanxue.su, прежняя host-only читается без нового входа и гаснет
// отдельным полем Set-Cookie на входе, продлении и выходе; две одноимённые
// cookie — отказ.
import request from 'supertest';
import { DateTime } from 'luxon';
import { SESSION_RENEW_AFTER_DAYS } from '../src/auth/session-renewal';
import { SESSION_MAX_AGE_SEC } from '../src/auth/session-token';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import {
  LEGACY_EXPIRATION,
  loginWithTelegram,
  logout,
  setCookies,
} from './e2e-support/session-profile-fixtures';

describe('DEPLOY_PROFILE=production (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, { DEPLOY_PROFILE: 'production' });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('вход: уборка host-only session и общая cookie на Domain=xuanxue.su — двумя полями', async () => {
    const res = await loginWithTelegram(server());
    expect(res.status).toBe(200);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe(LEGACY_EXPIRATION);
    expect(cookies[1]).toMatch(
      new RegExp(
        `^session=[\\w-]+\\.[\\w-]+\\.[\\w-]+; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; Domain=xuanxue\\.su; Secure$`,
      ),
    );
  });

  it('прежняя host-only cookie читается без нового входа, продление переносит её на общий домен', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Давно не заходил',
      roles: [],
      issuedAt: DateTime.utc().minus({ days: SESSION_RENEW_AFTER_DAYS + 1 }),
    });
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe(LEGACY_EXPIRATION);
    expect(cookies[1]).toMatch(/^session=.+; Domain=xuanxue\.su; Secure$/);
  });

  it('две cookie session — 401 в любом порядке, даже если обе валидны', async () => {
    const first = await createUserWithSession(testApp.app, { name: 'Первая', roles: [] });
    const second = await createUserWithSession(testApp.app, {
      name: 'Вторая',
      roles: [],
    });
    for (const header of [
      `${first.cookie}; ${second.cookie}`,
      `${second.cookie}; ${first.cookie}`,
      `${first.cookie}; ${first.cookie}`,
    ]) {
      const res = await request(server()).get('/api/auth/me').set('Cookie', header);
      expect(res.status).toBe(401);
    }
  });

  it('выход гасит и host-only, и общую cookie — и без сессии', async () => {
    const res = await logout(server());
    expect(res.status).toBe(204);
    expect(setCookies(res)).toEqual([
      LEGACY_EXPIRATION,
      'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Domain=xuanxue.su; Secure',
    ]);
  });
});
