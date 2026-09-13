// e2e на подтверждение человека (ADR-0026): доступ к самому действию (только
// admin) и полный путь — вошёл, ждёт, подтвердили, увидел расписание.
// Настоящий AppModule на MongoMemoryServer.
import request from 'supertest';
import type { MyLessonDto, UserDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('POST /users/:id/approve (e2e)', () => {
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

  function approve(cookie: string, id: string): request.Test {
    return withCsrf(request(server()).post(`/api/users/${id}/approve`)).set(
      'Cookie',
      cookie,
    );
  }

  function pendingPerson(): Promise<{ userId: string; cookie: string }> {
    return createUserWithSession(testApp.app, {
      name: 'Ждёт подтверждения',
      roles: [],
      status: 'invited',
    });
  }

  it('учитель и сам ждущий — 403, подтверждает только admin', async () => {
    const { userId } = await pendingPerson();
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { cookie: selfCookie } = await pendingPerson();

    expect((await approve(teacherCookie, userId)).status).toBe(403);
    expect((await approve(selfCookie, userId)).status).toBe(403);
  });

  it('admin подтверждает — статус active в ответе и в списке', async () => {
    const { userId } = await pendingPerson();
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);

    const res = await approve(adminCookie, userId);

    expect(res.status).toBe(200);
    expect((res.body as UserDto).status).toBe('active');
    const list = await request(server()).get('/api/users').set('Cookie', adminCookie);
    const found = (list.body as UserDto[]).find((user) => user.id === userId);
    expect(found?.status).toBe('active');
  });

  it('подтверждённый человек сразу видит своё расписание', async () => {
    const { userId, cookie } = await pendingPerson();
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);

    const before = await request(server()).get('/api/me/lessons').set('Cookie', cookie);
    expect(before.status).toBe(403);

    await approve(adminCookie, userId);

    const after = await request(server()).get('/api/me/lessons').set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body as MyLessonDto[]).toEqual([]);
  });
});
