// Вход из wiki на профиле стейджинга, настоящий AppModule (ADR-0183): своя
// cookie `session_staging` на Domain=staging.xuanxue.su и своя wiki; cookie
// прода `session` сессией не считается.
import { DateTime } from 'luxon';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { LEGACY_EXPIRATION, setCookies } from './e2e-support/session-profile-fixtures';
import {
  ENTRY_LOGIN_PATH,
  ENTRY_QUERY,
  enterWiki,
  expectNoStore,
} from './e2e-support/wiki-entry-fixtures';

describe('GET /wiki, PUBLIC_URL=https://staging.xuanxue.su (e2e)', () => {
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

  it('session_staging: 303 на wiki стейджинга, уборка host-only и cookie на своём домене', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель стейджинга',
      roles: [],
      issuedAt: DateTime.utc().minus({ days: 1 }),
    });
    const own = cookie.replace(/^session=/, 'session_staging=');
    const res = await enterWiki(server(), ENTRY_QUERY, own);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('https://wiki.staging.xuanxue.su/a?x=1#top');
    expectNoStore(res);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe(LEGACY_EXPIRATION);
    // Тот же токен под именем стейджинга, на домене стейджинга.
    expect(
      cookies[1]?.startsWith(`${own}; HttpOnly; SameSite=Lax; Path=/; Max-Age=`),
    ).toBe(true);
    expect(cookies[1]).toMatch(/; Domain=staging\.xuanxue\.su; Secure$/);
  });

  it('только cookie прода session — сессии нет: 303 на вход, без Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель прода',
      roles: [],
    });
    const res = await enterWiki(server(), ENTRY_QUERY, cookie);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(ENTRY_LOGIN_PATH);
    expect(setCookies(res)).toEqual([]);
    expectNoStore(res);
  });
});
