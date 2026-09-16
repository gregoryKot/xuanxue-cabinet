// e2e на подтверждение школой (ADR-0026, H1 аудита 2026-09-12): пока человек
// `invited`, он видит только себя — ни расписания со ссылками Zoom, ни
// экзаменов. А подтверждённый ученик без единой роли начинает попытку:
// роль `student` больше не нужна нигде. Настоящий AppModule на
// MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ExamDto, ExamItemDto, MeDto } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const ZOOM_LINK = 'https://zoom.us/j/9999999999?pwd=секрет';

describe('Подтверждение школой (e2e)', () => {
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

  async function createUpcomingLesson(): Promise<void> {
    const cls = await classModel().create({
      title: 'Тайцзицюань',
      format: 'online',
      zoomLink: ZOOM_LINK,
    });
    await lessonModel().create({
      classId: cls._id,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      durationMin: 60,
    });
  }

  async function createPublishedExam(teacherCookie: string): Promise<string> {
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'text', prompt: 'Опишите форму «пэнбу»' });
    const itemId = (item.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({ title: 'Экзамен', blocks: [{ itemIds: [itemId] }] });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    return examId;
  }

  function pendingSession(): Promise<{ userId: string; cookie: string }> {
    return createUserWithSession(testApp.app, {
      name: 'Только что вошёл',
      roles: [],
      status: 'invited',
    });
  }

  // Угроза №1 SECURITY §1 (зум-бомбинг): до подтверждения ссылки не видно.
  it('invited: расписание, экзамены и уведомления — 403, ссылки Zoom не отдаются', async () => {
    await createUpcomingLesson();
    const { cookie } = await pendingSession();

    const lessons = await request(server()).get('/api/me/lessons').set('Cookie', cookie);
    expect(lessons.status).toBe(403);
    expect(JSON.stringify(lessons.body)).not.toContain('zoom.us');
    expect((lessons.body as ApiErrorBody).message).toContain('подтверждения');

    expect(
      (await request(server()).get('/api/me/exams').set('Cookie', cookie)).status,
    ).toBe(403);
    expect(
      (await request(server()).get('/api/me/notifications').set('Cookie', cookie)).status,
    ).toBe(403);
    expect(
      (await request(server()).get('/api/lessons').set('Cookie', cookie)).status,
    ).toBe(403);
  });

  it('invited: GET /auth/me отвечает — экран ожидания знает, кто вошёл', async () => {
    const { userId, cookie } = await pendingSession();

    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body as MeDto).toEqual({
      id: userId,
      name: 'Только что вошёл',
      roles: [],
      tz: 'Asia/Jerusalem',
      status: 'invited',
      telegramLinked: false,
    });
  });

  // H1 аудита, сценарий Б: раньше старт попытки требовал роль `student`, которую
  // в кабинете нельзя назначить, — ученик получал 403 на своём первом экзамене.
  it('active без единой роли — ученик: начинает попытку и видит своё расписание', async () => {
    await createUpcomingLesson();
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', cookie);
    expect(started.status).toBe(201);

    const lessons = await request(server()).get('/api/me/lessons').set('Cookie', cookie);
    expect(lessons.status).toBe(200);
    expect(JSON.stringify(lessons.body)).toContain('zoom.us');
  });

  it('invited: попытку экзамена не начинает', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);
    const { cookie } = await pendingSession();

    const res = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', cookie);

    expect(res.status).toBe(403);
  });
});
