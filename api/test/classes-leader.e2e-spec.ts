// e2e на leaderId в POST/PATCH /classes — проверка через assertTeacherExists
// (аудит В4). Отдельный файл, не classes.e2e-spec.ts: тот уже на пределе
// файл-храповика (CLAUDE.md «Храповики»), тот же приём, что у
// lessons-broadcast-status.e2e-spec.ts (раскол lessons.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ClassDto } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = { title: 'Тайцзицюань', format: 'online' as const };

describe('POST/PATCH /classes — leaderId (e2e)', () => {
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

  function postClass(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchClass(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/classes/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  it('POST с leaderId ученика — 400, текст «не найден среди учителей»', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const student = await userModel().create({ name: 'Гриша', roles: [] });

    const res = await postClass(cookie, {
      ...VALID_BODY,
      leaderId: student._id.toString(),
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toContain('не найден среди учителей');
  });

  it('POST с leaderId учителя — 201, leaderId в ответе, виден при повторном GET (read-after-write)', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const teacher = await userModel().create({ name: 'Дмитрий', roles: ['teacher'] });

    const created = await postClass(cookie, {
      ...VALID_BODY,
      leaderId: teacher._id.toString(),
    });
    expect(created.status).toBe(201);
    const dto = created.body as ClassDto;
    expect(dto.leaderId).toBe(teacher._id.toString());

    const got = await request(server())
      .get(`/api/classes/${dto.id}`)
      .set('Cookie', cookie);
    expect((got.body as ClassDto).leaderId).toBe(teacher._id.toString());
  });

  it('PATCH с leaderId несуществующего пользователя — 400, занятие не меняется', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const created = await postClass(cookie, VALID_BODY);
    const dto = created.body as ClassDto;

    const res = await patchClass(cookie, dto.id, {
      leaderId: '507f1f77bcf86cd799439011',
    });

    expect(res.status).toBe(400);
    const got = await request(server())
      .get(`/api/classes/${dto.id}`)
      .set('Cookie', cookie);
    expect((got.body as ClassDto).leaderId).toBeUndefined();
  });

  it('PATCH { leaderId: null } — 200, ведущий снят', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const teacher = await userModel().create({ name: 'Дмитрий', roles: ['teacher'] });
    const created = await postClass(cookie, {
      ...VALID_BODY,
      leaderId: teacher._id.toString(),
    });
    const dto = created.body as ClassDto;

    const patched = await patchClass(cookie, dto.id, { leaderId: null });

    expect(patched.status).toBe(200);
    expect((patched.body as ClassDto).leaderId).toBeUndefined();
  });
});
