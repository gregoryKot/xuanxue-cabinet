// e2e «Занятие отменено» (ADR-0162, п. 4) на настоящем AppModule: read-after-
// write через две точки входа. Учитель отменяет занятие PATCH-ом /lessons/:id
// (запись), тик планировщика сообщает об этом ученикам (шаг вызывается
// напрямую: cron в e2e выключен, SCHEDULER_ENABLED=false), а ученик читает
// ленту в GET /me/inbox (чтение). Ни одна точка не подглядывает в базу мимо
// другой — так ловится расхождение между `cancelledAt`, который ставит
// LessonsService, и выборкой шага.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { DateTime } from 'luxon';
import type { InboxPageDto, LessonDto } from '@xuanxue/shared';
import { NOTIFICATION_LABELS } from '@xuanxue/shared';
import { LessonCancelNoticeService } from '../src/lessons/lesson-cancel-notice.service';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createLessonTestHelpers } from './e2e-support/lessons-fixtures';
import { createUserWithSession } from './e2e-support/session';

const LESSON_DAYS_AHEAD = 3;

describe('Занятие отменено — PATCH → тик → лента (e2e)', () => {
  let testApp: TestApp;
  const {
    server,
    sessionFor,
    classModel,
    lessonModel,
    createClass,
    postLesson,
    patchLesson,
  } = createLessonTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  // Люди и их настройки тоже чистятся: следующий тест не должен получить в
  // получатели учеников предыдущего — шаг тика пишет всем, кто подходит.
  afterEach(async () => {
    const get = <T>(name: string) =>
      testApp.app.get<Model<T>>(getModelToken(name), { strict: false });
    await Promise.all([
      lessonModel().deleteMany({}),
      classModel().deleteMany({}),
      get<NotificationRecord>(NotificationRecord.name).deleteMany({}),
      get<NotificationPrefsRecord>(NotificationPrefsRecord.name).deleteMany({}),
      get<UserRecord>(USER_MODEL_NAME).deleteMany({}),
    ]);
  });

  function tick(): Promise<{ notified: number }> {
    return testApp.app
      .get(LessonCancelNoticeService, { strict: false })
      .announce(DateTime.utc());
  }

  async function inboxOf(cookie: string): Promise<InboxPageDto> {
    const res = await request(server()).get('/api/me/inbox').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as InboxPageDto;
  }

  /** Занятие класса «Тайцзицюань» через несколько дней — в будущем по
   * настоящим часам, потому что PATCH ставит `cancelledAt` настоящим now. */
  async function scheduleLesson(
    teacher: string,
  ): Promise<{ lesson: LessonDto; classId: string }> {
    const classId = await createClass();
    const startsAt = DateTime.utc().plus({ days: LESSON_DAYS_AHEAD }).startOf('hour');
    const res = await postLesson(teacher, { classId, startsAt: startsAt.toISO() });
    expect(res.status).toBe(201);
    return { lesson: res.body as LessonDto, classId };
  }

  function putScope(cookie: string, classIds: string[]): request.Test {
    return withCsrf(request(server()).put('/api/me/notifications/lessons/scope'))
      .set('Cookie', cookie)
      .send({ mode: 'selected', classIds });
  }

  it('учитель отменил занятие → тик → ученик видит строку в ленте, выбравший другое занятие — нет', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await scheduleLesson(teacher);
    const { cookie: plain } = await createUserWithSession(testApp.app, {
      name: 'Ученик без выбора',
      roles: [],
    });
    const { cookie: picky } = await createUserWithSession(testApp.app, {
      name: 'Ученик с выбором',
      roles: [],
    });
    // PUT отклоняет несуществующие id занятий (400) — выбираем настоящее, но другое.
    const otherClass = await createClass();
    expect((await putScope(picky, [otherClass])).status).toBe(200);

    const cancel = await patchLesson(teacher, lesson.id, { status: 'cancelled' });
    expect(cancel.status).toBe(200);
    // Момент отмены — деталь хранения, наружу он не уходит.
    expect(cancel.body).not.toHaveProperty('cancelledAt');

    // Запись PATCH-а ленту не трогает: сообщает шаг тика, а не запрос.
    expect((await inboxOf(plain)).items).toEqual([]);
    expect(await tick()).toEqual({ notified: 1 });

    const page = await inboxOf(plain);
    expect(page.unreadCount).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      kind: 'lesson_cancelled',
      text: `${NOTIFICATION_LABELS.lesson_cancelled} — Тайцзицюань`,
      lessonId: lesson.id,
      lessonStartsAt: lesson.startsAt,
    });
    expect((await inboxOf(picky)).items).toEqual([]);
  });

  it('второй тик строки не дублирует: у ученика в ленте ровно одна', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await scheduleLesson(teacher);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    await patchLesson(teacher, lesson.id, { status: 'cancelled' });

    await tick();
    expect(await tick()).toEqual({ notified: 0 });

    expect((await inboxOf(cookie)).items).toHaveLength(1);
  });

  it('повторный PATCH со статусом cancelled и возврат в расписание не плодят строк', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await scheduleLesson(teacher);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    await patchLesson(teacher, lesson.id, { status: 'cancelled' });
    await tick();

    await patchLesson(teacher, lesson.id, { status: 'cancelled' });
    await patchLesson(teacher, lesson.id, { status: 'scheduled' });

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toHaveLength(1);
  });

  it('занятие вернули в расписание до тика — ученикам ничего не приходит', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await scheduleLesson(teacher);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    await patchLesson(teacher, lesson.id, { status: 'cancelled' });
    await patchLesson(teacher, lesson.id, { status: 'scheduled' });

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('ученик выключил «Занятие отменено» в настройках — строки в ленте нет', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await scheduleLesson(teacher);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const off = await withCsrf(request(server()).patch('/api/me/notifications'))
      .set('Cookie', cookie)
      .send({ kind: 'lesson_cancelled', enabled: false });
    expect(off.status).toBe(200);
    await patchLesson(teacher, lesson.id, { status: 'cancelled' });

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('штат школы ленту об отмене не получает', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await scheduleLesson(teacher);
    await patchLesson(teacher, lesson.id, { status: 'cancelled' });

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(teacher)).items).toEqual([]);
  });
});
