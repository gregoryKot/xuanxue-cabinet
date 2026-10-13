// Вход из wiki на профиле прода, настоящий AppModule (ADR-0183; контракт Workshop
// web-wiki-session): `GET /wiki?returnTo=` переносит сессию на общую cookie тем
// же токеном и остатком срока и возвращает браузер на wiki; без сессии — на вход
// кабинета; заблокированному — 403 без перехода.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DateTime } from 'luxon';
import { SESSION_RENEW_AFTER_DAYS } from '../src/auth/session-renewal';
import { SESSION_MAX_AGE_DAYS, SESSION_MAX_AGE_SEC } from '../src/auth/session-token';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { LEGACY_EXPIRATION, setCookies } from './e2e-support/session-profile-fixtures';
import {
  ENTRY_LOGIN_PATH,
  ENTRY_QUERY,
  enterWiki,
  expectNoStore,
} from './e2e-support/wiki-entry-fixtures';

const WIKI_LOCATION = 'https://wiki.xuanxue.su/a?x=1#top';
const RENEWAL_GRACE_SEC = 120;

describe('GET /wiki, PUBLIC_URL=https://xuanxue.su (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, { PUBLIC_URL: 'https://xuanxue.su' });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function tokenOf(cookie: string): string {
    return cookie.slice('session='.length);
  }

  /** Max-Age общей cookie и она сама — вторым полем после уборки host-only. */
  function sharedCookie(cookies: string[]): { token: string; maxAge: number } {
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe(LEGACY_EXPIRATION);
    const match =
      /^session=([^;]+); HttpOnly; SameSite=Lax; Path=\/; Max-Age=(\d+); Domain=xuanxue\.su; Secure$/.exec(
        cookies[1] ?? '',
      );
    expect(match).not.toBeNull();
    return { token: match?.[1] ?? '', maxAge: Number(match?.[2]) };
  }

  it('живая сессия: 303 на wiki, тот же токен и остаток срока, не новые 90 дней', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель',
      roles: [],
      issuedAt: DateTime.utc().minus({ days: 1 }),
    });
    const res = await enterWiki(server(), ENTRY_QUERY, cookie);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(WIKI_LOCATION);
    expectNoStore(res);
    const shared = sharedCookie(setCookies(res));
    expect(shared.token).toBe(tokenOf(cookie));
    const remaining = SESSION_MAX_AGE_SEC - 24 * 60 * 60;
    expect(shared.maxAge).toBeLessThanOrEqual(remaining);
    expect(shared.maxAge).toBeGreaterThan(remaining - RENEWAL_GRACE_SEC);
  });

  it('только прежняя host-only cookie — тот же ответ: у неё то же имя session', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Прежняя cookie',
      roles: [],
    });
    const res = await enterWiki(server(), undefined, cookie);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('https://wiki.xuanxue.su/');
    const shared = sharedCookie(setCookies(res));
    expect(shared.token).toBe(tokenOf(cookie));
    expect(shared.maxAge).toBeLessThanOrEqual(SESSION_MAX_AGE_SEC);
    expect(shared.maxAge).toBeGreaterThan(SESSION_MAX_AGE_SEC - RENEWAL_GRACE_SEC);
  });

  it('сессия старше порога продления — новый токен на полный срок', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Давно не заходил',
      roles: [],
      issuedAt: DateTime.utc().minus({ days: SESSION_RENEW_AFTER_DAYS + 1 }),
    });
    const res = await enterWiki(server(), ENTRY_QUERY, cookie);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(WIKI_LOCATION);
    const shared = sharedCookie(setCookies(res));
    expect(shared.token).not.toBe(tokenOf(cookie));
    expect(shared.maxAge).toBe(SESSION_MAX_AGE_SEC);
  });

  it('нет cookie, подделка, истёкший срок и повтор — 303 на вход, без Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель',
      roles: [],
    });
    const expired = await createUserWithSession(testApp.app, {
      name: 'Истёк',
      roles: [],
      issuedAt: DateTime.utc().minus({ days: SESSION_MAX_AGE_DAYS + 1 }),
    });
    const forged = `${cookie.slice(0, -2)}${cookie.endsWith('AA') ? 'BB' : 'AA'}`;
    for (const header of [undefined, forged, expired.cookie, `${cookie}; ${cookie}`]) {
      const res = await enterWiki(server(), ENTRY_QUERY, header);
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(ENTRY_LOGIN_PATH);
      expect(setCookies(res)).toEqual([]);
      expectNoStore(res);
    }
  });

  it('аккаунт удалён — 303 на вход, без Set-Cookie', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Удалённый',
      roles: [],
    });
    await testApp.app
      .get<Model<UserRecord>>(getModelToken(USER_MODEL_NAME), { strict: false })
      .deleteOne({ _id: userId });
    const res = await enterWiki(server(), ENTRY_QUERY, cookie);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(ENTRY_LOGIN_PATH);
    expect(setCookies(res)).toEqual([]);
  });

  it('заблокирован — 403 страница, без перехода и Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Заблокированный',
      roles: [],
      status: 'blocked',
    });
    const res = await enterWiki(server(), ENTRY_QUERY, cookie);
    expect(res.status).toBe(403);
    expect(res.headers.location).toBeUndefined();
    expect(setCookies(res)).toEqual([]);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Доступа нет');
    expect(res.text).not.toContain('<script');
    expectNoStore(res);
  });

  it('плохой returnTo — 400 страница, без перехода и Set-Cookie, даже с живой сессией', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель',
      roles: [],
    });
    const bad = [
      'returnTo=https%3A%2F%2Fevil.example',
      'returnTo=%2F%2Fevil.example',
      'returnTo=%2Fa&returnTo=%2Fb',
      'returnTo=%2Fa&x=1',
      'returnTo=%E0%A4%A',
      'returnTo=',
      'returnTo=%2F%5Cevil',
    ];
    for (const query of bad) {
      const res = await enterWiki(server(), query, cookie);
      expect(res.status).toBe(400);
      expect(res.headers.location).toBeUndefined();
      expect(setCookies(res)).toEqual([]);
      expect(res.text).toContain('Ссылка на wiki не сработала');
      expectNoStore(res);
    }
  });

  it('лимит запросов с одного адреса — 429 страница с Retry-After и no-store', async () => {
    const ip = '198.51.100.7';
    const attempt = async () =>
      await enterWiki(server(), 'x=1').set('x-forwarded-for', ip);
    let last = await attempt();
    for (let i = 0; i < 120 && last.status !== 429; i += 1) last = await attempt();
    expect(last.status).toBe(429);
    expect(Number(last.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(last.headers['content-type']).toContain('text/html');
    expect(last.text).toContain('Не получилось проверить вход');
    expect(last.headers.location).toBeUndefined();
    expectNoStore(last);
  }, 60_000);
});
