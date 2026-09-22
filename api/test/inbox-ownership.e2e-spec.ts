// e2e на владение лентой кабинета (`/me/inbox`, слой in-app уведомлений,
// ADR-0061, SECURITY §3): ученик А не видит ленту Б и не может пометить
// прочитанной чужую строку. Данные человека, не школы (ADR-0010) — владение
// по сессии, не по роли: доступно и ученику, и гостю без роли, тот же приём,
// что notifications-ownership.e2e-spec.ts. Записи сеются напрямую в Mongo
// (getModelToken) — тест владения ленты не обязан проходить весь путь
// экзамена, чтобы её наполнить (инструкция — e2e-support/README.md, шаг 2).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, InboxPageDto } from '@xuanxue/shared';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Лента кабинета — владение (e2e)', () => {
  let testApp: TestApp;
  let notificationModel: Model<NotificationRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    notificationModel = testApp.app.get<Model<NotificationRecord>>(
      getModelToken(NotificationRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await notificationModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('А не видит ленту Б в GET /me/inbox', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик А', roles: [] },
    );
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });
    await notificationModel.create({
      userId: userIdA,
      kind: 'exam_result',
      attemptId: 'a1',
      outcome: 'passed',
      readAt: null,
    });

    const getA = await request(server()).get('/api/me/inbox').set('Cookie', cookieA);
    expect(getA.status).toBe(200);
    expect((getA.body as InboxPageDto).items).toHaveLength(1);
    expect((getA.body as InboxPageDto).unreadCount).toBe(1);

    const getB = await request(server()).get('/api/me/inbox').set('Cookie', cookieB);
    expect(getB.status).toBe(200);
    expect((getB.body as InboxPageDto).items).toEqual([]);
    expect((getB.body as InboxPageDto).unreadCount).toBe(0);
  });

  it('Б не может пометить прочитанной строку А', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик А', roles: [] },
    );
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });
    const notification = await notificationModel.create({
      userId: userIdA,
      kind: 'exam_result',
      attemptId: 'a1',
      outcome: 'passed',
      readAt: null,
    });

    const readByB = await withCsrf(
      request(server()).post(`/api/me/inbox/${notification._id.toString()}/read`),
    ).set('Cookie', cookieB);
    expect(readByB.status).toBe(404);
    expect((readByB.body as ApiErrorBody).code).toBe('not_found');

    // Строка А осталась непрочитанной — Б её не тронул.
    const getA = await request(server()).get('/api/me/inbox').set('Cookie', cookieA);
    expect((getA.body as InboxPageDto).unreadCount).toBe(1);
  });

  it('А помечает свою строку прочитанной — read-after-write, unreadCount падает', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик А', roles: [] },
    );
    const notification = await notificationModel.create({
      userId: userIdA,
      kind: 'exam_result',
      attemptId: 'a1',
      outcome: 'passed',
      readAt: null,
    });

    const read = await withCsrf(
      request(server()).post(`/api/me/inbox/${notification._id.toString()}/read`),
    ).set('Cookie', cookieA);
    expect(read.status).toBe(200);
    const readBody = read.body as InboxPageDto; // вся лента, не одна строка (ADR-0087)
    expect(readBody.unreadCount).toBe(0);
    expect(
      readBody.items.find((item) => item.id === notification._id.toString())?.readAt,
    ).toBeDefined();
    const getA = await request(server()).get('/api/me/inbox').set('Cookie', cookieA);
    expect(read.body).toEqual(getA.body);
  });

  it('Б не может убрать (DELETE) строку А', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик А', roles: [] },
    );
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });
    const notification = await notificationModel.create({
      userId: userIdA,
      kind: 'exam_result',
      attemptId: 'a1',
      outcome: 'passed',
      readAt: null,
    });

    const dismissByB = await withCsrf(
      request(server()).delete(`/api/me/inbox/${notification._id.toString()}`),
    ).set('Cookie', cookieB);
    expect(dismissByB.status).toBe(404);
    expect((dismissByB.body as ApiErrorBody).code).toBe('not_found');

    // Строка А осталась в ленте — Б её не убрал.
    const getA = await request(server()).get('/api/me/inbox').set('Cookie', cookieA);
    expect((getA.body as InboxPageDto).items).toHaveLength(1);
  });

  it('А убирает свою строку (DELETE) — read-after-write, ушла из ленты и из unreadCount', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик А', roles: [] },
    );
    const notification = await notificationModel.create({
      userId: userIdA,
      kind: 'exam_result',
      attemptId: 'a1',
      outcome: 'passed',
      readAt: null,
    });

    const dismiss = await withCsrf(
      request(server()).delete(`/api/me/inbox/${notification._id.toString()}`),
    ).set('Cookie', cookieA);
    expect(dismiss.status).toBe(200); // не 204 — лента целиком (ADR-0087)
    const dismissBody = dismiss.body as InboxPageDto;
    expect(dismissBody.items).toEqual([]);
    expect(dismissBody.unreadCount).toBe(0);

    const getA = await request(server()).get('/api/me/inbox').set('Cookie', cookieA);
    expect(dismiss.body).toEqual(getA.body);
  });

  it('read-all гасит только свои непрочитанные, чужие не трогает', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик А', roles: [] },
    );
    const { userId: userIdB, cookie: cookieB } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик Б', roles: [] },
    );
    await notificationModel.create({
      userId: userIdA,
      kind: 'attempt_submitted',
      attemptId: 'a1',
      readAt: null,
    });
    await notificationModel.create({
      userId: userIdA,
      kind: 'exam_result',
      attemptId: 'a2',
      outcome: 'passed',
      readAt: null,
    });
    await notificationModel.create({
      userId: userIdB,
      kind: 'attempt_submitted',
      attemptId: 'a3',
      readAt: null,
    });

    const readAll = await withCsrf(request(server()).post('/api/me/inbox/read-all')).set(
      'Cookie',
      cookieA,
    );
    expect(readAll.status).toBe(200); // было 204, теперь лента целиком (ADR-0087)
    expect((readAll.body as InboxPageDto).unreadCount).toBe(0);

    const getA = await request(server()).get('/api/me/inbox').set('Cookie', cookieA);
    expect((getA.body as InboxPageDto).unreadCount).toBe(0);
    expect(readAll.body).toEqual(getA.body);

    const getB = await request(server()).get('/api/me/inbox').set('Cookie', cookieB);
    expect((getB.body as InboxPageDto).unreadCount).toBe(1);
  });

  it('гость без единой роли — доступ есть, тот же приём, что /me/exams', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Гость',
      roles: [],
    });

    const res = await request(server()).get('/api/me/inbox').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body as InboxPageDto).toEqual({ items: [], unreadCount: 0 });
  });

  it('без сессии — 401 на всех четырёх маршрутах', async () => {
    const list = await request(server()).get('/api/me/inbox');
    expect(list.status).toBe(401);

    const read = await withCsrf(
      request(server()).post('/api/me/inbox/507f1f77bcf86cd799439011/read'),
    );
    expect(read.status).toBe(401);

    const readAll = await withCsrf(request(server()).post('/api/me/inbox/read-all'));
    expect(readAll.status).toBe(401);

    const dismiss = await withCsrf(
      request(server()).delete('/api/me/inbox/507f1f77bcf86cd799439011'),
    );
    expect(dismiss.status).toBe(401);
  });
});
