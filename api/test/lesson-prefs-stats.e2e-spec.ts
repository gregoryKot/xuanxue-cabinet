// e2e число для штата к выбору «о каких занятиях» и «за сколько» (ADR-0162,
// п. 5) на настоящем AppModule: GET /notifications/lesson-prefs-stats — без
// сессии 401, ученику и бухгалтеру 403 (это школьная сводка, не данные
// человека), штату — три числа. Read-after-write через две точки входа: ученик
// пишет свой выбор `PUT /me/notifications/lessons/...`, штат читает число.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ClassDto, LessonPrefsStatsDto } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const STATS_PATH = '/api/notifications/lesson-prefs-stats';
const SCOPE_PATH = '/api/me/notifications/lessons/scope';
const REMINDER_PATH = '/api/me/notifications/lessons/reminder-minutes';

describe('Число «выбрали свои занятия и время» для штата (e2e)', () => {
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
      get<ClassRecord>(ClassRecord.name).deleteMany({}),
      get<NotificationPrefsRecord>(NotificationPrefsRecord.name).deleteMany({}),
      get<UserRecord>(USER_MODEL_NAME).deleteMany({}),
    ]);
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function studentCookie(name: string): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, { name, roles: [] });
    return cookie;
  }

  async function createClass(): Promise<ClassDto> {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', adminCookie)
      .send({
        title: 'Цигун',
        format: 'online',
        rules: [{ weekday: 2, time: '19:00', durationMin: 60 }],
      });
    expect(res.status).toBe(201);
    return res.body as ClassDto;
  }

  async function getStats(cookie: string): Promise<LessonPrefsStatsDto> {
    const res = await request(server()).get(STATS_PATH).set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as LessonPrefsStatsDto;
  }

  it('без сессии — 401', async () => {
    const res = await request(server()).get(STATS_PATH);

    expect(res.status).toBe(401);
  });

  it('ученику и бухгалтеру — 403: сводка школы, не данные человека', async () => {
    const student = await studentCookie('Ученик');
    const accountant = await sessionCookieFor(testApp.app, ['accountant']);

    for (const cookie of [student, accountant]) {
      const res = await request(server()).get(STATS_PATH).set('Cookie', cookie);

      expect(res.status).toBe(403);
      expect((res.body as ApiErrorBody).code).toBe('forbidden');
    }
  });

  it('штат видит те же числа: учитель, помощник и админ', async () => {
    const vanya = await studentCookie('Ваня');
    await withCsrf(request(server()).put(REMINDER_PATH))
      .set('Cookie', vanya)
      .send({ minutes: 15 })
      .expect(200);

    for (const role of ['teacher', 'assistant', 'admin'] as const) {
      const cookie = await sessionCookieFor(testApp.app, [role]);

      expect(await getStats(cookie)).toEqual({
        activeStudents: 1,
        chosenClasses: 0,
        ownReminder: 1,
      });
    }
  });

  it('пустая школа — три нуля, штат в число не входит', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);

    expect(await getStats(teacher)).toEqual({
      activeStudents: 0,
      chosenClasses: 0,
      ownReminder: 0,
    });
  });

  it('ученики выбирают сами → штат видит число сразу (read-after-write)', async () => {
    const cls = await createClass();
    const vanya = await studentCookie('Ваня');
    const masha = await studentCookie('Маша');
    await studentCookie('Петя');
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    expect(await getStats(teacher)).toEqual({
      activeStudents: 3,
      chosenClasses: 0,
      ownReminder: 0,
    });

    await withCsrf(request(server()).put(SCOPE_PATH))
      .set('Cookie', vanya)
      .send({ mode: 'selected', classIds: [cls.id] })
      .expect(200);
    // «Все» с галочкой — не выбор: режим «все» список не стирает.
    await withCsrf(request(server()).put(SCOPE_PATH))
      .set('Cookie', masha)
      .send({ mode: 'all', classIds: [cls.id] })
      .expect(200);
    await withCsrf(request(server()).put(REMINDER_PATH))
      .set('Cookie', masha)
      .send({ minutes: 120 })
      .expect(200);

    expect(await getStats(teacher)).toEqual({
      activeStudents: 3,
      chosenClasses: 1,
      ownReminder: 1,
    });

    // Вернулся к «как в школе» — число падает обратно.
    await withCsrf(request(server()).put(REMINDER_PATH))
      .set('Cookie', masha)
      .send({ minutes: null })
      .expect(200);
    expect((await getStats(teacher)).ownReminder).toBe(0);
  });

  it('заблокированный ученик в числа не входит, а ответ — ровно три числа', async () => {
    await createUserWithSession(testApp.app, {
      name: 'Заблокированный',
      roles: [],
      status: 'blocked',
    });
    await studentCookie('Ваня');
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await request(server()).get(STATS_PATH).set('Cookie', teacher);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'activeStudents',
      'chosenClasses',
      'ownReminder',
    ]);
    expect((res.body as LessonPrefsStatsDto).activeStudents).toBe(1);
  });
});
