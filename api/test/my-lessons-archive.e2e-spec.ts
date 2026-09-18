// e2e на /me/lessons/archive (ТЗ docs/PLAN.md §14 слой 3.3) — тот же приём,
// что у my-lessons.e2e-spec.ts: расписание школы, не данные пользователя,
// доступ по сессии, не по роли. `telegramFileId` не должен попасть в ответ
// ни в каком виде — тот же приём проверки, что у exam-media-telegram.e2e-spec.ts
// (grep по сырому JSON тела ответа). Настоящий AppModule на MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, MyArchivedLessonDto, UserRole } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';

const FILE_ID = 'BAACAgIAAxkBAAI-archive-secret-file-id';

describe('/me/lessons/archive (e2e)', () => {
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

  async function createPastLessonWithRecording(): Promise<string> {
    const cls = await classModel().create({
      title: 'Тайцзицюань',
      groupLabel: 'группа А',
      format: 'online',
    });
    const lesson = await lessonModel().create({
      classId: cls._id,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      durationMin: 60,
      topic: 'Форма 24',
      recordings: [
        { title: 'Занятие целиком', url: 'https://cloud.example/rec-archive' },
        { title: 'В канале', telegramFileId: FILE_ID },
      ],
    });
    return lesson._id.toString();
  }

  it('без сессии — 401', async () => {
    const res = await request(server()).get('/api/me/lessons/archive');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик (roles: []) видит прошедшее занятие с записью, telegramFileId в ответе нет', async () => {
    const lessonId = await createPastLessonWithRecording();
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = res.body as MyArchivedLessonDto[];
    expect(body.map((l) => l.id)).toEqual([lessonId]);
    expect(body[0]?.recordings).toEqual([
      { title: 'Занятие целиком', url: 'https://cloud.example/rec-archive' },
      { title: 'В канале', inTelegramOnly: true },
    ]);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(FILE_ID);
    expect(raw).not.toContain('telegramFileId');
  });

  it('учитель тоже получает 200 — маршрут без @Roles', async () => {
    await createPastLessonWithRecording();
    const cookie = await sessionCookieFor(testApp.app, ['teacher'] satisfies UserRole[]);

    const res = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body as MyArchivedLessonDto[]).toHaveLength(1);
  });

  it('limit выше 100 — 400, «дай всё» запрещён', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);
    const res = await request(server())
      .get('/api/me/lessons/archive')
      .query({ limit: 101 })
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});
