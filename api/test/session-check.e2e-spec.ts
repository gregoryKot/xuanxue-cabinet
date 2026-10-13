// GET /api/auth/session — проверка браузерной сессии для бэкенда Daychi
// (ADR-0183, контракт Workshop web-wiki-session) на настоящем AppModule:
// 204 без тела / 401 / 403 / 429, `Cache-Control: no-store` на каждом ответе
// и продление одной действующей cookie. Отказы пишет глобальный фильтр, не
// доходя до контроллера, поэтому заголовок проверяется и на них.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { DateTime } from 'luxon';
import { SESSION_RENEW_AFTER_DAYS } from '../src/auth/session-renewal';
import { SESSION_MAX_AGE_SEC } from '../src/auth/session-token';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { setCookies } from './e2e-support/session-profile-fixtures';
import { freshIp } from './e2e-support/telegram-widget-fixtures';

const LIMIT_PER_MINUTE = 120;
const SESSION_PATH = '/api/auth/session';

describe('GET /api/auth/session (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function check(cookie?: string): request.Test {
    const req = request(testApp.app.getHttpServer())
      .get(SESSION_PATH)
      .set('x-forwarded-for', freshIp());
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function users(): Model<UserRecord> {
    return testApp.app.get<Model<UserRecord>>(getModelToken(USER_MODEL_NAME), {
      strict: false,
    });
  }

  function expectRefusal(res: request.Response, status: number): void {
    expect(res.status).toBe(status);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(setCookies(res)).toEqual([]);
  }

  it('валидная свежая сессия — 204, пустое тело, no-store, без Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель',
      roles: [],
    });
    const res = await check(cookie);
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toBe('');
    expect(res.body).toEqual({});
    expect(setCookies(res)).toEqual([]);
  });

  it('без cookie — 401', async () => {
    expectRefusal(await check(), 401);
  });

  it('поддельный токен — 401', async () => {
    expectRefusal(await check('session=a.b.c'), 401);
  });

  it('просроченный токен — 401', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Давний',
      roles: [],
      issuedAt: DateTime.utc().minus({ seconds: SESSION_MAX_AGE_SEC + 60 }),
    });
    expectRefusal(await check(cookie), 401);
  });

  it('аккаунт удалён — 401', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Удалённый',
      roles: [],
    });
    await users().deleteOne({ _id: userId });
    expectRefusal(await check(cookie), 401);
  });

  it('аккаунт заблокирован — 403, а после разблокировки — 204', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Заблокированный',
      roles: [],
      status: 'blocked',
    });
    expectRefusal(await check(cookie), 403);

    await users().updateOne({ _id: userId }, { status: 'active' });
    const res = await check(cookie);
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('две cookie session — 401, даже если значения одинаковые', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Дважды',
      roles: [],
    });
    expectRefusal(await check(`${cookie}; ${cookie}`), 401);
  });

  it('токен старше порога продления — 204 и ровно одно поле Set-Cookie без уборки', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Давно не заходил',
      roles: [],
      issuedAt: DateTime.utc().minus({ days: SESSION_RENEW_AFTER_DAYS + 1 }),
    });
    const res = await check(cookie);
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^session=.+/);
    expect(cookies[0]).not.toContain('Max-Age=0');
  });

  it('лимит троттлера по сессии — 429 с no-store и без Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Частый',
      roles: [],
    });
    for (let i = 0; i < LIMIT_PER_MINUTE; i++) {
      expect((await check(cookie)).status).toBe(204);
    }
    expectRefusal(await check(cookie), 429);
  });
});
