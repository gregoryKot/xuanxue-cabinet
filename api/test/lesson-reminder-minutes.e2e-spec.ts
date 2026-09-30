// e2e «за сколько минут напомнить о занятии» (ADR-0162) на настоящем AppModule:
// PUT /me/notifications/lessons/reminder-minutes. Без сессии 401 проверяет
// соседний lesson-notifications.e2e-spec.ts; здесь — PUT → GET
// (read-after-write), школьное значение рядом, минуты не из списка и
// отсутствие поля — 400 (прежний выбор цел), владение по сессии.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  type ApiErrorBody,
  type MyLessonNotificationsDto,
} from '@xuanxue/shared';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { SettingsRecord } from '../src/settings/settings.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const LESSONS_PATH = '/api/me/notifications/lessons';
const REMINDER_PATH = `${LESSONS_PATH}/reminder-minutes`;

describe('Своё «за сколько минут напомнить» (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    const get = <T>(name: string) =>
      testApp.app.get<Model<T>>(getModelToken(name), { strict: false });
    await Promise.all([
      get<NotificationPrefsRecord>(NotificationPrefsRecord.name).deleteMany({}),
      get<SettingsRecord>(SettingsRecord.name).deleteMany({}),
      get<UserRecord>(USER_MODEL_NAME).deleteMany({}),
    ]);
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function studentCookie(name = 'Ученик'): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, { name, roles: [] });
    return cookie;
  }

  async function getLessons(cookie: string): Promise<MyLessonNotificationsDto> {
    const res = await request(server()).get(LESSONS_PATH).set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as MyLessonNotificationsDto;
  }

  function putReminder(cookie: string, body: unknown): request.Test {
    return withCsrf(request(server()).put(REMINDER_PATH))
      .set('Cookie', cookie)
      .send(body as object);
  }

  it('по умолчанию — «как в школе»: minutes null и школьное значение рядом', async () => {
    const page = await getLessons(await studentCookie());

    expect(page.reminder).toEqual({
      minutes: null,
      schoolMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    });
  });

  it('PUT 30 → ответ равен GET сразу после (read-after-write, ADR-0087)', async () => {
    const cookie = await studentCookie();

    const put = await putReminder(cookie, { minutes: 30 });

    expect(put.status).toBe(200);
    const written = put.body as MyLessonNotificationsDto;
    expect(written.reminder).toEqual({
      minutes: 30,
      schoolMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    });
    expect(await getLessons(cookie)).toEqual(written);
  });

  it('PUT null возвращает «как в школе»', async () => {
    const cookie = await studentCookie();
    await putReminder(cookie, { minutes: 120 });

    const put = await putReminder(cookie, { minutes: null });

    expect(put.status).toBe(200);
    expect((put.body as MyLessonNotificationsDto).reminder.minutes).toBeNull();
    expect((await getLessons(cookie)).reminder.minutes).toBeNull();
  });

  it('школа меняет своё значение на «Шаблонах» — schoolMinutes в ответе следует за ним', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const patch = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', adminCookie)
      .send({ lessonReminderMinutes: 90 });
    expect(patch.status).toBe(200);
    const cookie = await studentCookie();
    await putReminder(cookie, { minutes: 15 });

    expect((await getLessons(cookie)).reminder).toEqual({
      minutes: 15,
      schoolMinutes: 90,
    });
  });

  it.each([15, 30, 60, 120])('пункт списка %p принимается', async (minutes) => {
    const res = await putReminder(await studentCookie(), { minutes });

    expect(res.status).toBe(200);
  });

  it.each([
    ['число не из списка', { minutes: 45 }],
    ['ноль', { minutes: 0 }],
    ['строка', { minutes: '30' }],
    ['дробное', { minutes: 30.5 }],
    ['нет поля', {}],
    ['чужой userId в теле', { minutes: 30, userId: 'чужой' }],
  ])('кривое тело (%s) — 400, прежний выбор цел', async (_name, body) => {
    const cookie = await studentCookie();
    await putReminder(cookie, { minutes: 60 });

    const res = await putReminder(cookie, body);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    expect((await getLessons(cookie)).reminder.minutes).toBe(60);
  });

  it('владение по сессии: выбор ученика А не виден и не меняется учеником Б', async () => {
    const cookieA = await studentCookie('Ученик А');
    const cookieB = await studentCookie('Ученик Б');

    await putReminder(cookieA, { minutes: 120 });
    await putReminder(cookieB, { minutes: 15 });

    expect((await getLessons(cookieA)).reminder.minutes).toBe(120);
    expect((await getLessons(cookieB)).reminder.minutes).toBe(15);

    await putReminder(cookieB, { minutes: null });

    expect((await getLessons(cookieA)).reminder.minutes).toBe(120);
  });

  it('выбор «за сколько» и выбор занятий не затирают друг друга', async () => {
    const cookie = await studentCookie();

    await withCsrf(request(server()).put(`${LESSONS_PATH}/scope`))
      .set('Cookie', cookie)
      .send({ mode: 'selected', classIds: [] });
    await putReminder(cookie, { minutes: 30 });

    const page = await getLessons(cookie);
    expect(page.reminder.minutes).toBe(30);
    expect(page.scope).toEqual({ mode: 'selected', classIds: [] });
  });
});
