// e2e на теги занятий расписания (ADR-0070) — рубрикация свободным текстом,
// постоянный признак курса: отдельный файл от classes.e2e-spec.ts, тот же
// приём, что у lessons-tags.e2e-spec.ts/materials-tags.e2e-spec.ts.
// Настоящий AppModule на MongoMemoryServer.
import type { ApiErrorBody, ClassDto, LessonDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  createLessonTestHelpers,
  FROM,
  STARTS_AT,
  TO,
} from './e2e-support/lessons-fixtures';

const VALID_BODY = { title: 'Тайцзицюань', format: 'online' as const };

describe('Теги занятий расписания (e2e, ADR-0070)', () => {
  let testApp: TestApp;
  const { server, sessionFor, classModel, lessonModel, postLesson } =
    createLessonTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  });

  function postClass(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchClass(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/classes/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  it('создание с тегами → GET отдаёт их назад нормализованными', async () => {
    const cookie = await sessionFor(['teacher']);

    const created = await postClass(cookie, {
      ...VALID_BODY,
      tags: ['  Начинающие ', 'начинающие', 'дракон'],
    });

    expect(created.status).toBe(201);
    expect((created.body as ClassDto).tags).toEqual(['Начинающие', 'дракон']);

    const list = await request(server()).get('/api/classes').set('Cookie', cookie);
    const dto = (list.body as ClassDto[]).find(
      (c) => c.id === (created.body as ClassDto).id,
    );
    expect(dto?.tags).toEqual(['Начинающие', 'дракон']);
  });

  it('PATCH с тегами нормализует и заменяет прежний набор', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postClass(cookie, { ...VALID_BODY, tags: ['раз'] });

    const patched = await patchClass(cookie, (created.body as ClassDto).id, {
      tags: ['Два', 'два', '  Три  '],
    });

    expect(patched.status).toBe(200);
    expect((patched.body as ClassDto).tags).toEqual(['Два', 'Три']);
  });

  it('PATCH без tags — прежние теги остаются на месте', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postClass(cookie, { ...VALID_BODY, tags: ['начинающие'] });

    const patched = await patchClass(cookie, (created.body as ClassDto).id, {
      groupLabel: 'средняя группа',
    });

    expect(patched.status).toBe(200);
    expect((patched.body as ClassDto).tags).toEqual(['начинающие']);
  });

  it('PATCH { tags: [] } — снимает все теги (поле не в NULLABLE_CLASS_FIELDS)', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postClass(cookie, { ...VALID_BODY, tags: ['начинающие'] });

    const patched = await patchClass(cookie, (created.body as ClassDto).id, { tags: [] });

    expect(patched.status).toBe(200);
    expect((patched.body as ClassDto).tags).toEqual([]);
  });

  it('POST со слишком длинным тегом — 400 invalid_input', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postClass(cookie, { ...VALID_BODY, tags: ['а'.repeat(41)] });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('GET /api/classes?tag= находит занятие расписания с этим тегом', async () => {
    const cookie = await sessionFor(['teacher']);
    const tagged = await postClass(cookie, { ...VALID_BODY, tags: ['начинающие'] });
    await postClass(cookie, { ...VALID_BODY, title: 'Другое занятие' });

    const res = await request(server())
      .get('/api/classes')
      .query({ tag: 'начинающие' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const ids = (res.body as ClassDto[]).map((c) => c.id);
    expect(ids).toEqual([(tagged.body as ClassDto).id]);
  });

  // Главный сценарий ADR-0070: тег ставится один раз в расписании, дата без
  // своего тега находится в /lessons по тегу курса — без копии тега в её документ.
  it('GET /api/lessons?tag= находит даты занятия расписания по его тегу курса, не копируя тег в дату', async () => {
    const cookie = await sessionFor(['teacher']);
    const tagged = await postClass(cookie, { ...VALID_BODY, tags: ['начинающие'] });
    const classId = (tagged.body as ClassDto).id;
    const lesson = await postLesson(cookie, { classId, startsAt: STARTS_AT });

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO, tag: 'начинающие' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const found = (res.body as LessonDto[]).find(
      (l) => l.id === (lesson.body as LessonDto).id,
    );
    expect(found).toBeDefined();
    // Тег остаётся только у курса — сама дата его не получает (ADR-0070 «Решение»).
    expect(found?.tags).toEqual([]);
  });

  it('ученик: GET /classes?tag= — 403, как и без фильтра', async () => {
    const cookie = await sessionFor([]);

    const res = await request(server())
      .get('/api/classes')
      .query({ tag: 'начинающие' })
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
  });
});
