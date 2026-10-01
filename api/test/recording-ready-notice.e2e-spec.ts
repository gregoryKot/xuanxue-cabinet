// e2e «Запись занятия» (ADR-0162, п. 4) на настоящем AppModule: read-after-write
// через три точки входа. Ученик включает вид в PATCH /me/notifications (он «по
// желанию», в дефолте его нет), учитель добавляет запись POST-ом
// /lessons/:id/recording, тик планировщика сообщает об этом (шаг вызывается
// напрямую: cron в e2e выключен, SCHEDULER_ENABLED=false), а ученик читает ленту
// в GET /me/inbox. Ни одна точка не подглядывает в базу мимо другой — так
// ловится расхождение между `recordingReadyAt`, который ставит LessonsService, и
// выборкой шага.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { DateTime } from 'luxon';
import type { InboxPageDto, LessonDto, NotificationPrefsDto } from '@xuanxue/shared';
import { NOTIFICATION_LABELS } from '@xuanxue/shared';
import { RecordingReadyNoticeService } from '../src/lessons/recording-ready-notice.service';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createLessonTestHelpers, postRecording } from './e2e-support/lessons-fixtures';
import { createUserWithSession } from './e2e-support/session';

const LESSON_HOURS_AGO = 3;
const RECORDING_URL = 'https://example.com/rec-1';
const SECOND_RECORDING_URL = 'https://example.com/rec-2';

describe('Запись занятия — включил → POST записи → тик → лента (e2e)', () => {
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
      .get(RecordingReadyNoticeService, { strict: false })
      .announce(DateTime.utc());
  }

  async function inboxOf(cookie: string): Promise<InboxPageDto> {
    const res = await request(server()).get('/api/me/inbox').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as InboxPageDto;
  }

  async function newStudent(name: string): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, { name, roles: [] });
    return cookie;
  }

  /** PATCH /me/notifications — то, что делает переключатель экрана и бот. */
  function switchRecordingNotice(cookie: string, enabled: boolean): request.Test {
    return withCsrf(request(server()).patch('/api/me/notifications'))
      .set('Cookie', cookie)
      .send({ kind: 'recording_ready', enabled });
  }

  /** Занятие класса «Тайцзицюань», которое началось несколько часов назад: запись
   * к прошедшему занятию — обычный случай, и в «Записях занятий» ученика оно
   * видно только после начала. PATCH/POST ставят момент настоящим now. */
  async function pastLesson(
    teacher: string,
  ): Promise<{ lesson: LessonDto; classId: string }> {
    const classId = await createClass();
    const startsAt = DateTime.utc().minus({ hours: LESSON_HOURS_AGO }).startOf('hour');
    const res = await postLesson(teacher, { classId, startsAt: startsAt.toISO() });
    expect(res.status).toBe(201);
    return { lesson: res.body as LessonDto, classId };
  }

  function putScope(cookie: string, classIds: string[]): request.Test {
    return withCsrf(request(server()).put('/api/me/notifications/lessons/scope'))
      .set('Cookie', cookie)
      .send({ mode: 'selected', classIds });
  }

  it('включивший ученик видит запись в ленте, не включавший — нет', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    const eager = await newStudent('Ученик, включивший вид');
    const quiet = await newStudent('Ученик без выбора');

    const before = await request(server())
      .get('/api/me/notifications')
      .set('Cookie', quiet);
    expect((before.body as NotificationPrefsDto).enabled).not.toContain(
      'recording_ready',
    );
    const on = await switchRecordingNotice(eager, true);
    expect(on.status).toBe(200);
    expect((on.body as NotificationPrefsDto).enabled).toContain('recording_ready');

    const added = await postRecording(server(), teacher, lesson.id, RECORDING_URL);
    expect(added.status).toBe(201);
    // Момент записи — деталь хранения, наружу он не уходит.
    expect(added.body).not.toHaveProperty('recordingReadyAt');

    // Запись POST-а ленту не трогает: сообщает шаг тика, а не запрос.
    expect((await inboxOf(eager)).items).toEqual([]);
    expect(await tick()).toEqual({ notified: 1 });

    const page = await inboxOf(eager);
    expect(page.unreadCount).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      kind: 'recording_ready',
      text: `${NOTIFICATION_LABELS.recording_ready} — Тайцзицюань`,
      lessonId: lesson.id,
      lessonStartsAt: lesson.startsAt,
    });
    expect((await inboxOf(quiet)).items).toEqual([]);
  });

  it('выключил вид обратно до тика — строки в ленте нет', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    const cookie = await newStudent('Ученик');
    await switchRecordingNotice(cookie, true);
    await switchRecordingNotice(cookie, false);
    await postRecording(server(), teacher, lesson.id, RECORDING_URL);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('вторая запись и второй тик строки не дублируют: у ученика в ленте ровно одна', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    const cookie = await newStudent('Ученик');
    await switchRecordingNotice(cookie, true);
    await postRecording(server(), teacher, lesson.id, RECORDING_URL);
    await tick();

    await postRecording(server(), teacher, lesson.id, SECOND_RECORDING_URL);
    expect(await tick()).toEqual({ notified: 0 });

    expect((await inboxOf(cookie)).items).toHaveLength(1);
  });

  it('PATCH занятия (тема) записи не объявляет: нужна именно запись', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    const cookie = await newStudent('Ученик');
    await switchRecordingNotice(cookie, true);

    const patched = await patchLesson(teacher, lesson.id, { topic: 'Новая тема' });
    expect(patched.status).toBe(200);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('выбравший другое занятие записи этого занятия не получает', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    const picky = await newStudent('Ученик с выбором');
    await switchRecordingNotice(picky, true);
    // PUT отклоняет несуществующие id занятий (400) — выбираем настоящее, но другое.
    const otherClass = await createClass();
    expect((await putScope(picky, [otherClass])).status).toBe(200);
    await postRecording(server(), teacher, lesson.id, RECORDING_URL);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(picky)).items).toEqual([]);
  });

  it('ученик записей не добавляет: 403, и в ленту ничего не попадает', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    const cookie = await newStudent('Ученик');
    await switchRecordingNotice(cookie, true);

    const res = await postRecording(server(), cookie, lesson.id, RECORDING_URL);
    expect(res.status).toBe(403);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('штат школы ленту о записи не получает, даже включив вид руками', async () => {
    const teacher = await sessionFor(['teacher']);
    const { lesson } = await pastLesson(teacher);
    await switchRecordingNotice(teacher, true);
    await postRecording(server(), teacher, lesson.id, RECORDING_URL);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(teacher)).items).toEqual([]);
  });
});
