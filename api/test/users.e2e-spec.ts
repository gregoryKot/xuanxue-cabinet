// e2e на /users — экран «Люди» (docs/PLAN.md §6, блокер аудита Б3): доступ
// только admin (данные школы, ADR-0010), список без ПДн (SECURITY §1).
// Матрица доступа — e2e-support/README.md: без cookie 401, без ролей и
// student 403, admin 200.
import request from 'supertest';
import type { ApiErrorBody, UserDto, UserRole } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { createUsersTestHelpers } from './e2e-support/users-fixtures';

describe('Users (e2e)', () => {
  let testApp: TestApp;
  const { server, userModel, sessionFor, createUser, getUsers, patchUser } =
    createUsersTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await userModel().deleteMany({});
  });

  it('GET /users без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/users');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('PATCH /users/:id без cookie, но с x-requested-with — 401 (не 403)', async () => {
    const target = await createUser();
    const res = await withCsrf(request(server()).patch(`/api/users/${target.id}`)).send({
      roles: [],
    });
    expect(res.status).toBe(401);
  });

  it.each([
    ['гость', [] as UserRole[]],
    ['ученик', ['student'] as UserRole[]],
    ['учитель', ['teacher'] as UserRole[]],
    // Помощник учителя правами равен учителю везде, кроме UsersController
    // (docs/SECURITY.md §2): назначение ролей и удаление данных — только admin.
    ['помощник учителя', ['assistant'] as UserRole[]],
    ['бухгалтер', ['accountant'] as UserRole[]],
  ])('%s: GET и PATCH /users — 403', async (_label, roles) => {
    const cookie = await sessionFor(roles);
    const other = await createUser();

    expect((await getUsers(cookie)).status).toBe(403);
    expect((await patchUser(cookie, other.id, { roles: ['teacher'] })).status).toBe(403);
  });

  it('админ: GET /users — 200, без telegramId/email/googleId', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    await createUser({ name: 'Ученик с Telegram', telegramId: 555, email: 'a@b.co' });

    const res = await getUsers(cookie);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('telegramId');
    expect(body).not.toContain('email');
    expect(body).not.toContain('googleId');
    const list = res.body as UserDto[];
    expect(list.find((u) => u.name === 'Ученик с Telegram')?.hasTelegram).toBe(true);
  });

  it('PATCH меняет роли — видно при следующем GET, ПДн нет в ответе PATCH', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const target = await createUser({
      name: 'Гриша',
      telegramId: 777,
      email: 'grisha@example.com',
      googleId: 'g-2',
    });

    const patched = await patchUser(cookie, target.id, { roles: ['teacher'] });
    expect(patched.status).toBe(200);
    expect((patched.body as UserDto).roles).toEqual(['teacher']);
    const patchedBody = JSON.stringify(patched.body);
    expect(patchedBody).not.toContain('telegramId');
    expect(patchedBody).not.toContain('email');
    expect(patchedBody).not.toContain('googleId');

    const got = await getUsers(cookie).then((r) =>
      (r.body as UserDto[]).find((u) => u.id === target.id),
    );
    expect(got?.roles).toEqual(['teacher']);
  });

  it('снять admin у себя — 403 с текстом «снимает другой администратор»', async () => {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Маша',
      roles: ['admin'],
    });
    await createUser({ name: 'Второй админ', roles: ['admin'] });

    const res = await patchUser(cookie, userId, { roles: [] });

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toContain('снимает другой администратор');
  });

  // «Последний администратор» (UserRolesService.isLastAdmin) не проверяется
  // здесь отдельным HTTP-кейсом: чтобы вызвать PATCH, нужен свой admin-cookie —
  // значит вызывающий сам остаётся админом после чужого снятия роли, и
  // единственный способ довести общее число админов до нуля одним запросом —
  // снять роль у себя, а это перехватывает более ранняя и более точная по
  // тексту проверка самоснятия выше. Ветка — защита в глубину на случай
  // изменения порядка проверок или вызова сервиса не из этого контроллера;
  // покрыта отдельно в user-roles.service.spec.ts (юнит на mongodb-memory-server).

  it('роль вне списка (roles: ["boss"]) — 400', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const target = await createUser();

    const res = await patchUser(cookie, target.id, { roles: ['boss'] });
    expect(res.status).toBe(400);
  });
});
