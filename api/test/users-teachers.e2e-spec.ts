// e2e на GET /users/teachers — select «Ведущий» в форме занятия
// (docs/PLAN.md §6 п.2, аудит В4). Отдельный файл, не users.e2e-spec.ts: тот
// уже на пределе файл-храповика (CLAUDE.md «Храповики»), тот же приём, что у
// classes-leader.e2e-spec.ts. Доступ отличается от остального /users — виден
// и учителю, не только admin.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, TeacherOptionDto, UserRole } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('GET /users/teachers (e2e)', () => {
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

  function userModel(): Model<UserRecord> {
    return testApp.app.get(getModelToken(UserRecord.name), { strict: false });
  }

  afterEach(async () => {
    await userModel().deleteMany({});
  });

  it('без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/users/teachers');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it.each([
    ['ученик', ['student'] as UserRole[]],
    ['гость', [] as UserRole[]],
    // UsersController целиком (включая этот маршрут) не отдан assistant —
    // помощник учителя видит расписание и занятия, но не список пользователей
    // (docs/SECURITY.md §2).
    ['помощник учителя', ['assistant'] as UserRole[]],
    ['бухгалтер', ['accountant'] as UserRole[]],
  ])('%s: GET /users/teachers — 403', async (_label, roles) => {
    const cookie = await sessionCookieFor(testApp.app, roles);
    const res = await request(server()).get('/api/users/teachers').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('учитель: 200, список без ПДн — teacher/admin активные, без ученика и заблокированного', async () => {
    await userModel().create({ name: 'Ученик', roles: ['student'] });
    await userModel().create({
      name: 'Уволенный',
      roles: ['teacher'],
      status: 'blocked',
    });
    const admin = await userModel().create({ name: 'Мария', roles: ['admin'] });
    const teacher = await userModel().create({
      name: 'Дмитрий',
      roles: ['teacher'],
      telegramId: 999,
      email: 'd@example.com',
    });
    // Сама вызывающая сессия — тоже active teacher (createUserWithSession) и
    // законно попадает в список, поэтому её id учтён в ожидаемом наборе, а не
    // отфильтрован.
    const { userId: callerId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Себе тоже виден',
      roles: ['teacher'],
    });

    const res = await request(server()).get('/api/users/teachers').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('telegramId');
    expect(body).not.toContain('email');
    const list = res.body as TeacherOptionDto[];
    expect(list.map((t) => t.id).sort()).toEqual(
      [admin._id.toString(), teacher._id.toString(), callerId].sort(),
    );
  });

  it('админ: 200', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await request(server()).get('/api/users/teachers').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
