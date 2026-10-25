// Вход из wiki на локальном профиле (PUBLIC_URL — не прод и не стейджинг),
// настоящий AppModule (ADR-0183): wiki у окружения нет, маршрут отвечает как
// любой неизвестный адрес — 404, без перехода и без cookie.
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { setCookies } from './e2e-support/session-profile-fixtures';
import { ENTRY_QUERY, enterWiki } from './e2e-support/wiki-entry-fixtures';

describe('GET /wiki, локальный профиль (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('404 и с живой сессией, и без неё', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Читатель',
      roles: [],
    });
    for (const header of [undefined, cookie]) {
      const res = await enterWiki(testApp.app.getHttpServer(), ENTRY_QUERY, header);
      expect(res.status).toBe(404);
      expect(res.headers.location).toBeUndefined();
      expect(setCookies(res)).toEqual([]);
    }
  });
});
