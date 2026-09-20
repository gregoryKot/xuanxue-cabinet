// e2e на теги дат занятий (ADR-0059) — рубрикация свободным текстом, не
// признак расписания: отдельный файл от lessons.e2e-spec.ts, тот же приём,
// что у materials-tags.e2e-spec.ts (слой 3.11). Настоящий AppModule на
// MongoMemoryServer, общие хелперы/роли — lessons-fixtures.ts (тот же
// приём, что у lessons-broadcast-status.e2e-spec.ts).
import { TAG_LIMITS, type ApiErrorBody, type LessonDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createLessonTestHelpers,
  FROM,
  STARTS_AT,
  TO,
} from './e2e-support/lessons-fixtures';

describe('Теги дат занятий (e2e, ADR-0059)', () => {
  let testApp: TestApp;
  const { server, sessionFor, classModel, lessonModel, createClass, postLesson } =
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

  it('создание с тегами → GET отдаёт их назад нормализованными', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();

    const created = await postLesson(cookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['  Старшая ', 'старшая', 'разминка'],
    });

    expect(created.status).toBe(201);
    expect((created.body as LessonDto).tags).toEqual(['Старшая', 'разминка']);

    const list = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', cookie);
    const dto = (list.body as LessonDto[]).find(
      (l) => l.id === (created.body as LessonDto).id,
    );
    expect(dto?.tags).toEqual(['Старшая', 'разминка']);
  });

  it('GET /api/lessons?tag= фильтрует по тегу', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();
    const tagged = await postLesson(cookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['старшая'],
    });
    await postLesson(cookie, { classId, startsAt: '2026-09-04T16:00:00Z' });

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO, tag: 'старшая' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const ids = (res.body as LessonDto[]).map((l) => l.id);
    expect(ids).toEqual([(tagged.body as LessonDto).id]);
  });

  it('POST со слишком длинным тегом — 400 invalid_input', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();

    const res = await postLesson(cookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['а'.repeat(TAG_LIMITS.length + 1)],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('ученик: GET /api/lessons — 403, тег не приоткрывает эндпоинт штата', async () => {
    const cookie = await sessionFor([]);

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO, tag: 'старшая' })
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
  });
});
