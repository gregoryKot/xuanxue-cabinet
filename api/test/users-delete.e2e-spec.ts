// e2e на DELETE /users/:id (docs/PLAN.md §6, аудит В11): доступ только admin
// (данные школы, ADR-0010, e2e-support/README.md), read-after-write на
// документ users и на leaderId класса, который вёл удалённый пользователь.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ClassDto, UserRole } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { createUsersTestHelpers } from './e2e-support/users-fixtures';

describe('DELETE /users/:id (e2e)', () => {
  let testApp: TestApp;
  let classModel: Model<ClassRecord>;
  const { server, userModel, sessionFor, createUser, getUsers } = createUsersTestHelpers(
    () => testApp,
  );

  function deleteUser(cookie: string, id: string): request.Test {
    return withCsrf(request(server()).delete(`/api/users/${id}`)).set('Cookie', cookie);
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    classModel = testApp.app.get<Model<ClassRecord>>(getModelToken(ClassRecord.name), {
      strict: false,
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await Promise.all([userModel().deleteMany({}), classModel.deleteMany({})]);
  });

  it('без cookie, но с x-requested-with — 401 (не 403)', async () => {
    const target = await createUser();
    const res = await withCsrf(request(server()).delete(`/api/users/${target.id}`));
    expect(res.status).toBe(401);
  });

  it.each([
    ['ученик', [] as UserRole[]],
    ['учитель', ['teacher'] as UserRole[]],
    // Помощник учителя правами равен учителю везде, кроме UsersController
    // (docs/SECURITY.md §2): удаление данных остаётся только у admin.
    ['помощник учителя', ['assistant'] as UserRole[]],
    ['бухгалтер', ['accountant'] as UserRole[]],
  ])('%s: DELETE /users/:id — 403', async (_label, roles) => {
    const cookie = await sessionFor(roles);
    const target = await createUser();

    expect((await deleteUser(cookie, target.id)).status).toBe(403);
  });

  it('админ: 204, документ users исчезает, GET /users его не показывает', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const target = await createUser({ name: 'Гриша', telegramId: 909 });

    const res = await deleteUser(cookie, target.id);
    expect(res.status).toBe(204);

    const list = (await getUsers(cookie)).body as { id: string }[];
    expect(list.find((u) => u.id === target.id)).toBeUndefined();
  });

  it('удаление ведущего — класс остаётся, leaderId в ответе отсутствует', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const leader = await createUser({ name: 'Ведущий', roles: ['teacher'] });
    const cls = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      leaderId: leader.id,
    });

    expect((await deleteUser(cookie, leader.id)).status).toBe(204);

    const got = await request(server())
      .get(`/api/classes/${cls._id.toString()}`)
      .set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect((got.body as ClassDto).leaderId).toBeUndefined();
  });

  it('себя — 403 с текстом «Свой аккаунт удалить нельзя»', async () => {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Маша',
      roles: ['admin'],
    });
    await createUser({ name: 'Второй админ', roles: ['admin'] });

    const res = await deleteUser(cookie, userId);

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toContain('Свой аккаунт удалить нельзя');
  });
});
