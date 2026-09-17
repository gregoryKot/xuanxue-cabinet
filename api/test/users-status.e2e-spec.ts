// e2e на PATCH /users/:id/status — блокировка/открытие доступа на «Людях»
// (ADR-0036, RUNBOOK §8.15). Матрица доступа — тот же приём, что
// users.e2e-spec.ts: без cookie 401, без роли admin 403, admin 200.
// Ограничения (себе, последнему активному админу) — users-status-limits.e2e-spec.ts,
// отдельный файл: иначе файл переезжает потолок file-size-ratchet.
import request from 'supertest';
import type { ApiErrorBody, UserDto } from '@xuanxue/shared';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { createUsersTestHelpers } from './e2e-support/users-fixtures';

describe('Users status (e2e)', () => {
  let testApp: TestApp;
  const { server, userModel, createUser, getUsers, patchStatus } = createUsersTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await userModel().deleteMany({});
  });

  it('PATCH /users/:id/status без cookie, но с x-requested-with — 401', async () => {
    const target = await createUser();
    const res = await withCsrf(
      request(server()).patch(`/api/users/${target.id}/status`),
    ).send({ status: 'blocked' });
    expect(res.status).toBe(401);
  });

  it('учитель — 403 (данные школы, ADR-0010)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Учитель',
      roles: ['teacher'],
    });
    const target = await createUser();

    const res = await patchStatus(cookie, target.id, { status: 'blocked' });
    expect(res.status).toBe(403);
  });

  it('статус вне списка («invited») — 400', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const target = await createUser();

    const res = await patchStatus(cookie, target.id, { status: 'invited' });
    expect(res.status).toBe(400);
  });

  it('admin блокирует ученика — 200, без ПДн в ответе, виден в GET /users', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const target = await createUser({ name: 'Ученик', telegramId: 999, email: 'a@b.co' });

    const res = await patchStatus(cookie, target.id, { status: 'blocked' });
    expect(res.status).toBe(200);
    expect((res.body as UserDto).status).toBe('blocked');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('telegramId');
    expect(body).not.toContain('email');

    const list = await getUsers(cookie);
    expect((list.body as UserDto[]).find((u) => u.id === target.id)?.status).toBe(
      'blocked',
    );
  });

  it('сессия заблокированного — 403 c ACCESS_MESSAGE на /auth/me; admin открывает — снова 200', async () => {
    const { cookie: adminCookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const { userId, cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const blocked = await patchStatus(adminCookie, userId, { status: 'blocked' });
    expect(blocked.status).toBe(200);

    const meBlocked = await request(server())
      .get('/api/auth/me')
      .set('Cookie', studentCookie);
    expect(meBlocked.status).toBe(403);
    expect((meBlocked.body as ApiErrorBody).message).toBe(ACCESS_MESSAGE);

    const opened = await patchStatus(adminCookie, userId, { status: 'active' });
    expect(opened.status).toBe(200);

    const meActive = await request(server())
      .get('/api/auth/me')
      .set('Cookie', studentCookie);
    expect(meActive.status).toBe(200);
  });
});
