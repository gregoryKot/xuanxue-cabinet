// e2e проверок ввода /events (ADR-0177): границы дат, обязательные поля,
// сброс `null` в PATCH, лимит списка, CSRF. Доступ по ролям и чтение ученика —
// в school-events.e2e-spec.ts. Время заморожено (CLAUDE.md «Детерминизм»).
import { Settings } from 'luxon';
import request from 'supertest';
import {
  SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
  type ApiErrorBody,
  type SchoolEventDto,
} from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';
import {
  createSchoolEventHelpers,
  SCHOOL_EVENT_BODY as VALID_BODY,
  SCHOOL_EVENTS_NOW as NOW,
} from './e2e-support/school-events-fixtures';

const MISSING_ID = '000000000000000000000000';

describe('События школы — проверки ввода (e2e)', () => {
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

  it('конец раньше начала при создании — 400 с подсказкой', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await postEvent(cookie, {
      title: 'Ретрит',
      startsAt: '2026-11-20T07:00:00Z',
      endsAt: '2026-11-19T07:00:00Z',
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(
      SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
    );
  });

  it('PATCH начала за сохранённый конец — 400, событие не меняется', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const event = await createEvent(cookie);

    const res = await patchEvent(cookie, event.id, { startsAt: '2026-12-01T07:00:00Z' });

    expect(res.status).toBe(400);
    const list = await request(server()).get('/api/events').set('Cookie', cookie);
    expect((list.body as SchoolEventDto[])[0]?.startsAt).toBe('2026-11-20T07:00:00.000Z');
  });

  it.each([
    ['пустое название', { ...VALID_BODY, title: '   ' }],
    ['название длиннее 120 знаков', { ...VALID_BODY, title: 'а'.repeat(121) }],
    ['нет начала', { title: 'Ретрит' }],
    ['дата не ISO', { title: 'Ретрит', startsAt: 'завтра' }],
    ['время без смещения', { title: 'Ретрит', startsAt: '2026-11-20T07:00:00' }],
  ])('POST: %s — 400 invalid_input', async (_name, body) => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await postEvent(cookie, body);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it.each([
    ['title', null],
    ['startsAt', null],
  ])('PATCH: %s = null — 400, эти поля не сбрасываются', async (field, value) => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const event = await createEvent(cookie);

    const res = await patchEvent(cookie, event.id, { [field]: value });

    expect(res.status).toBe(400);
  });

  it('PATCH и DELETE несуществующего id — 404', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const patch = await patchEvent(cookie, MISSING_ID, { title: 'x' });
    const del = await deleteEvent(cookie, MISSING_ID);

    expect([patch.status, del.status]).toEqual([404, 404]);
  });

  it('GET ?limit=0 и ?limit=201 — 400, ?limit=1 — один элемент', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    await createEvent(cookie);
    await createEvent(cookie, { title: 'Второе', startsAt: '2026-12-01T07:00:00Z' });

    const get = (query: string): request.Test =>
      request(server()).get(`/api/events?${query}`).set('Cookie', cookie);

    expect((await get('limit=0')).status).toBe(400);
    expect((await get('limit=201')).status).toBe(400);
    expect(((await get('limit=1')).body as SchoolEventDto[]).length).toBe(1);
  });

  it('POST без x-requested-with — 403 (CSRF)', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await request(server())
      .post('/api/events')
      .set('Cookie', cookie)
      .send(VALID_BODY);

    expect(res.status).toBe(403);
  });
});
