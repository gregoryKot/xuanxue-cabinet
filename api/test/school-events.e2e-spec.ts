// e2e на /events и /me/events — данные школы (ADR-0010, ADR-0177): доступ по
// роли, не по владельцу (e2e-support/README.md, «данные школы»). Настоящий
// AppModule на MongoMemoryServer. Время — Settings.now Luxon, заморожено
// (CLAUDE.md «Детерминизм»): «предстоящее» не зависит от часов машины.
// Проверки ввода — в school-events-validation.e2e-spec.ts.
import { Settings } from 'luxon';
import request from 'supertest';
import {
  SCHOOL_EVENT_NOT_FOUND_MESSAGE,
  type ApiErrorBody,
  type SchoolEventDto,
  type UserRole,
} from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import {
  createSchoolEventHelpers,
  SCHOOL_EVENT_BODY,
  SCHOOL_EVENTS_NOW as NOW,
} from './e2e-support/school-events-fixtures';
import { createUserWithSession } from './e2e-support/session';

const VALID_BODY = SCHOOL_EVENT_BODY;
const STAFF_ROLES: UserRole[] = ['teacher', 'assistant', 'admin'];

describe('События школы (e2e)', () => {
  let testApp: TestApp;
  const { server, eventModel, postEvent, patchEvent, deleteEvent, createEvent } =
    createSchoolEventHelpers(() => testApp);
  const realNow = Settings.now;

  beforeAll(async () => {
    Settings.now = () => NOW.toMillis();
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    Settings.now = realNow;
    await testApp.close();
  });

  afterEach(async () => {
    await eventModel().deleteMany({});
  });

  describe('без сессии', () => {
    it.each(['/api/events', '/api/me/events'])(
      'GET %s — 401 в конверте',
      async (path) => {
        const res = await request(server()).get(path);

        expect(res.status).toBe(401);
        expect((res.body as ApiErrorBody).code).toBe('unauthorized');
      },
    );

    it('POST /events — 401', async () => {
      const res = await withCsrf(request(server()).post('/api/events')).send(VALID_BODY);

      expect(res.status).toBe(401);
    });
  });

  describe('ученик (без ролей)', () => {
    it('GET, POST, PATCH и DELETE /events — 403, событие не меняется', async () => {
      const staff = await sessionCookieFor(testApp.app, ['teacher']);
      const event = await createEvent(staff);
      const student = await sessionCookieFor(testApp.app, []);

      const get = await request(server()).get('/api/events').set('Cookie', student);
      const post = await postEvent(student, VALID_BODY);
      const patch = await patchEvent(student, event.id, { title: 'Взлом' });
      const del = await deleteEvent(student, event.id);

      expect([get.status, post.status, patch.status, del.status]).toEqual([
        403, 403, 403, 403,
      ]);
      const list = await request(server()).get('/api/events').set('Cookie', staff);
      expect((list.body as SchoolEventDto[]).map((e) => e.title)).toEqual([
        VALID_BODY.title,
      ]);
    });

    it('GET /me/events — только предстоящие и идущие, ближайшие сверху', async () => {
      const staff = await sessionCookieFor(testApp.app, ['teacher']);
      await createEvent(staff, { title: 'Прошло', startsAt: '2026-11-05T07:00:00Z' });
      await createEvent(staff, {
        title: 'Прошло с концом',
        startsAt: '2026-11-05T07:00:00Z',
        endsAt: '2026-11-07T07:00:00Z',
      });
      await createEvent(staff, { title: 'Позже', startsAt: '2026-12-20T07:00:00Z' });
      await createEvent(staff, {
        title: 'Идёт',
        startsAt: '2026-11-10T07:00:00Z',
        endsAt: '2026-11-12T07:00:00Z',
      });
      const student = await sessionCookieFor(testApp.app, []);

      const res = await request(server()).get('/api/me/events').set('Cookie', student);

      expect(res.status).toBe(200);
      expect((res.body as SchoolEventDto[]).map((e) => e.title)).toEqual([
        'Идёт',
        'Позже',
      ]);
    });

    it('ответ без служебных полей Mongo, тексты расшифрованы', async () => {
      const staff = await sessionCookieFor(testApp.app, ['teacher']);
      const created = await createEvent(staff);
      const student = await sessionCookieFor(testApp.app, []);

      const res = await request(server()).get('/api/me/events').set('Cookie', student);

      const [event] = res.body as Array<Record<string, unknown>>;
      expect(event).not.toHaveProperty('_id');
      expect(event).not.toHaveProperty('__v');
      expect(event).not.toHaveProperty('updatedAt');
      expect(event).toMatchObject({
        id: created.id,
        title: VALID_BODY.title,
        place: VALID_BODY.place,
        description: VALID_BODY.description,
      });
      const raw = await eventModel().collection.findOne<{ title: string }>({});
      expect(raw?.title).not.toBe(VALID_BODY.title);
      expect(JSON.stringify(res.body)).not.toContain(raw?.title ?? 'нет-записи');
    });

    it('нет событий — пустой массив', async () => {
      const student = await sessionCookieFor(testApp.app, []);

      const res = await request(server()).get('/api/me/events').set('Cookie', student);

      expect(res.body).toEqual([]);
    });
  });

  describe.each(STAFF_ROLES)('%s', (role) => {
    it('CRUD целиком: create → list → patch → delete → 404', async () => {
      const { userId, cookie } = await createUserWithSession(testApp.app, {
        name: 'Штат',
        roles: [role],
      });

      const created = await postEvent(cookie, VALID_BODY);
      expect(created.status).toBe(201);
      const dto = created.body as SchoolEventDto;
      expect(dto).toMatchObject({
        ...VALID_BODY,
        startsAt: '2026-11-20T07:00:00.000Z',
        endsAt: '2026-11-22T15:00:00.000Z',
        createdBy: userId,
      });
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const list = await request(server()).get('/api/events').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as SchoolEventDto[]).map((e) => e.id)).toEqual([dto.id]);

      const patched = await patchEvent(cookie, dto.id, {
        title: 'Ретрит в Негеве',
        place: null,
        endsAt: null,
      });
      expect(patched.status).toBe(200);
      const patchedDto = patched.body as SchoolEventDto;
      expect(patchedDto.title).toBe('Ретрит в Негеве');
      expect(patchedDto.place).toBeUndefined();
      expect(patchedDto.endsAt).toBeUndefined();
      expect(patchedDto.description).toBe(VALID_BODY.description);

      const deleted = await deleteEvent(cookie, dto.id);
      expect(deleted.status).toBe(204);
      const again = await deleteEvent(cookie, dto.id);
      expect(again.status).toBe(404);
      expect((again.body as ApiErrorBody).message).toBe(SCHOOL_EVENT_NOT_FOUND_MESSAGE);
    });
  });

  it('событие одного учителя видно другому штату — общий список школы', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const assistant = await sessionCookieFor(testApp.app, ['assistant']);
    const event = await createEvent(teacher);

    const list = await request(server()).get('/api/events').set('Cookie', assistant);

    expect((list.body as SchoolEventDto[]).map((e) => e.id)).toEqual([event.id]);
  });
});
