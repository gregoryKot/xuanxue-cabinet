// e2e на /me/lessons (ТЗ student-api.md) — расписание школы, не данные
// пользователя: доступ по сессии, не по роли и не по владельцу (тот же
// приём, что у notifications-ownership.e2e-spec.ts для /me/notifications).
// Настоящий AppModule на MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, MyLessonDto, UserRole } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';

describe('/me/lessons (e2e)', () => {
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

  function classModel(): Model<ClassRecord> {
    return testApp.app.get(getModelToken(ClassRecord.name), { strict: false });
  }

  function lessonModel(): Model<LessonRecord> {
    return testApp.app.get(getModelToken(LessonRecord.name), { strict: false });
  }

  afterEach(async () => {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  });

  async function createUpcomingLesson(): Promise<string> {
    const cls = await classModel().create({
      title: 'Тайцзицюань',
      groupLabel: 'группа А',
      format: 'online',
    });
    const lesson = await lessonModel().create({
      classId: cls._id,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      durationMin: 60,
      topic: 'Форма 24',
    });
    return lesson._id.toString();
  }

  it('без сессии — 401', async () => {
    const res = await request(server()).get('/api/me/lessons');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  const ROLE_CASES: { roles: UserRole[] }[] = [
    { roles: ['student'] },
    { roles: ['teacher'] },
    { roles: ['assistant'] },
    { roles: ['admin'] },
    { roles: [] },
  ];

  it.each(ROLE_CASES)(
    'роль $roles видит одно и то же расписание школы',
    async ({ roles }) => {
      const lessonId = await createUpcomingLesson();
      const cookie = await sessionCookieFor(testApp.app, roles);

      const res = await request(server()).get('/api/me/lessons').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as MyLessonDto[]).map((l) => l.id)).toEqual([lessonId]);
    },
  );

  it('гость без роли получает тот же список, что ученик — не пустой ответ по умолчанию', async () => {
    await createUpcomingLesson();
    const guestCookie = await sessionCookieFor(testApp.app, []);
    const studentCookie = await sessionCookieFor(testApp.app, ['student']);

    const guestRes = await request(server())
      .get('/api/me/lessons')
      .set('Cookie', guestCookie);
    const studentRes = await request(server())
      .get('/api/me/lessons')
      .set('Cookie', studentCookie);

    expect(guestRes.body).toEqual(studentRes.body);
  });

  it('limit выше 50 — 400, «дай всё» запрещён', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['student']);
    const res = await request(server())
      .get('/api/me/lessons')
      .query({ limit: 51 })
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});
