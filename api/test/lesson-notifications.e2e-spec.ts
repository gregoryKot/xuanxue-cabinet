// e2e «о каких занятиях напоминать» (ADR-0162) на настоящем AppModule:
// GET/PUT /me/notifications/lessons — без сессии 401 (и на соседнем
// reminder-minutes, остальное про него — lesson-reminder-minutes.e2e-spec.ts),
// выбор по владельцу из сессии (ученик Б чужого не видит и не меняет),
// PUT → GET (read-after-write),
// несуществующее занятие и не-ObjectId — 400, а ответ не выдаёт ссылку Zoom,
// пароль, каналы и теги (его видит любой вошедший, включая ученика).
// Данные человека, не школы (ADR-0010) — владение по сессии, не по роли.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type {
  ApiErrorBody,
  ClassDto,
  LessonScopeClassDto,
  MyLessonNotificationsDto,
} from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const ZOOM_LINK = 'https://us02web.zoom.us/j/555';
const ZOOM_PASSWORD = 'секретный-пароль';
const LESSONS_PATH = '/api/me/notifications/lessons';
const SCOPE_PATH = `${LESSONS_PATH}/scope`;
const REMINDER_PATH = `${LESSONS_PATH}/reminder-minutes`;
const PUBLIC_CLASS_KEYS = ['groupLabel', 'id', 'slots', 'title', 'tz'];

describe('Выбор «о каких занятиях» (e2e)', () => {
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

  /** Занятие заводит админ обычным `POST /classes` — так же, как в кабинете:
   * ссылка Zoom и пароль шифруются, теги попадают в документ. */
  async function createClass(
    title: string,
    extra: Record<string, unknown> = {},
  ): Promise<ClassDto> {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', adminCookie)
      .send({
        title,
        format: 'online',
        zoomLink: ZOOM_LINK,
        zoomPassword: ZOOM_PASSWORD,
        tags: ['начинающие'],
        rules: [{ weekday: 2, time: '19:00', durationMin: 60 }],
        ...extra,
      });
    expect(res.status).toBe(201);
    return res.body as ClassDto;
  }

  async function getLessons(cookie: string): Promise<MyLessonNotificationsDto> {
    const res = await request(server()).get(LESSONS_PATH).set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as MyLessonNotificationsDto;
  }

  function putScope(cookie: string, body: unknown): request.Test {
    return withCsrf(request(server()).put(SCOPE_PATH))
      .set('Cookie', cookie)
      .send(body as object);
  }

  async function studentCookie(name = 'Ученик'): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, { name, roles: [] });
    return cookie;
  }

  it('без сессии — 401 на все три маршрута', async () => {
    const get = await request(server()).get(LESSONS_PATH);
    const put = await withCsrf(request(server()).put(SCOPE_PATH)).send({
      mode: 'all',
      classIds: [],
    });
    const reminder = await withCsrf(request(server()).put(REMINDER_PATH)).send({
      minutes: 30,
    });

    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
    expect(reminder.status).toBe(401);
  });

  it('по умолчанию — обо всех занятиях; в списке только активные', async () => {
    const active = await createClass('Цигун');
    const hidden = await createClass('Выключенное');
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const off = await withCsrf(request(server()).patch(`/api/classes/${hidden.id}`))
      .set('Cookie', adminCookie)
      .send({ active: false });
    expect(off.status).toBe(200);
    const cookie = await studentCookie();

    const page = await getLessons(cookie);

    expect(page.scope).toEqual({ mode: 'all', classIds: [] });
    expect(page.classes.map((c) => c.id)).toEqual([active.id]);
    expect(page.classes[0]).toEqual({
      id: active.id,
      title: 'Цигун',
      groupLabel: '',
      tz: active.tz,
      slots: [{ weekday: 2, time: '19:00', durationMin: 60 }],
    });
  });

  it('ответ не выдаёт ссылку Zoom, пароль, каналы, теги ни ученику, ни админу', async () => {
    await createClass('Цигун', { groupLabel: 'Утро' });
    const cookies = [
      await studentCookie(),
      await sessionCookieFor(testApp.app, ['admin']),
    ];

    for (const cookie of cookies) {
      const res = await request(server()).get(LESSONS_PATH).set('Cookie', cookie);
      const body = res.body as MyLessonNotificationsDto;

      expect(res.status).toBe(200);
      for (const item of body.classes) {
        expect(Object.keys(item).sort()).toEqual(PUBLIC_CLASS_KEYS);
      }
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(ZOOM_LINK);
      expect(raw).not.toContain(ZOOM_PASSWORD);
      expect(raw).not.toContain('начинающие');
    }
  });

  it('PUT выбранных занятий → ответ равен GET сразу после (read-after-write, ADR-0087)', async () => {
    const first = await createClass('Цигун');
    await createClass('Тайцзи');
    const cookie = await studentCookie();

    const put = await putScope(cookie, { mode: 'selected', classIds: [first.id] });

    expect(put.status).toBe(200);
    const written = put.body as MyLessonNotificationsDto;
    expect(written.scope).toEqual({ mode: 'selected', classIds: [first.id] });
    expect(written.classes).toHaveLength(2);
    expect(await getLessons(cookie)).toEqual(written);
  });

  it('режим «все» не стирает галочки: вернулся к «выбранным» — они на месте', async () => {
    const cls = await createClass('Цигун');
    const cookie = await studentCookie();

    await putScope(cookie, { mode: 'selected', classIds: [cls.id] });
    const back = await putScope(cookie, { mode: 'all', classIds: [cls.id] });

    expect((back.body as MyLessonNotificationsDto).scope).toEqual({
      mode: 'all',
      classIds: [cls.id],
    });
    expect((await getLessons(cookie)).scope.classIds).toEqual([cls.id]);
  });

  it('несуществующее занятие — 400 с понятным текстом, прежний выбор цел', async () => {
    const cls = await createClass('Цигун');
    const cookie = await studentCookie();
    await putScope(cookie, { mode: 'selected', classIds: [cls.id] });

    const res = await putScope(cookie, {
      mode: 'selected',
      classIds: [cls.id, new Types.ObjectId().toString()],
    });

    expect(res.status).toBe(400);
    const error = res.body as ApiErrorBody;
    expect(error.code).toBe('invalid_input');
    expect(error.message).toContain('Обновите страницу');
    expect((await getLessons(cookie)).scope).toEqual({
      mode: 'selected',
      classIds: [cls.id],
    });
  });

  it.each([
    ['id не ObjectId', { mode: 'selected', classIds: ['не-id'] }],
    ['неизвестный режим', { mode: 'none', classIds: [] }],
    ['нет списка', { mode: 'selected' }],
    ['список не массив', { mode: 'selected', classIds: 'abc' }],
    [
      'слишком длинный список',
      { mode: 'selected', classIds: new Array(51).fill('a'.repeat(24)) },
    ],
  ])('кривое тело (%s) — 400, ничего не записано', async (_name, body) => {
    const cookie = await studentCookie();

    const res = await putScope(cookie, body);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    expect((await getLessons(cookie)).scope).toEqual({ mode: 'all', classIds: [] });
  });

  it('владение по сессии: выбор ученика А не виден и не меняется учеником Б', async () => {
    const cls = await createClass('Цигун');
    const cookieA = await studentCookie('Ученик А');
    const cookieB = await studentCookie('Ученик Б');

    await putScope(cookieA, { mode: 'selected', classIds: [cls.id] });
    // Чужой userId в теле не проходит: владелец — только сессия.
    const injected = await putScope(cookieB, {
      mode: 'selected',
      classIds: [],
      userId: 'чужой',
    });

    expect(injected.status).toBe(400);
    expect((await getLessons(cookieB)).scope).toEqual({ mode: 'all', classIds: [] });

    await putScope(cookieB, { mode: 'selected', classIds: [] });
    expect((await getLessons(cookieA)).scope).toEqual({
      mode: 'selected',
      classIds: [cls.id],
    });
  });

  it('доступно и без ролей (ученик), и учителю: у каждого свой выбор', async () => {
    const cls = await createClass('Цигун');
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const studentCookieValue = await studentCookie();

    await putScope(teacherCookie, { mode: 'selected', classIds: [cls.id] });

    expect((await getLessons(teacherCookie)).scope.mode).toBe('selected');
    expect((await getLessons(studentCookieValue)).scope.mode).toBe('all');
  });

  it('список занятий — тип без лишних полей: сверка с публичным интерфейсом', async () => {
    await createClass('Цигун');
    const page = await getLessons(await studentCookie());
    const item: LessonScopeClassDto | undefined = page.classes[0];

    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual(PUBLIC_CLASS_KEYS);
  });
});
