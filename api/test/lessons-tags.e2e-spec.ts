// e2e на теги дат занятий (ADR-0075, уточняет ADR-0058) — рубрикация
// свободным текстом, не доступ: отдельный файл от lessons.e2e-spec.ts, тот
// же приём, что у materials-tags.e2e-spec.ts. Настоящий AppModule на
// MongoMemoryServer.
import type {
  ApiErrorBody,
  LessonDto,
  MyArchivedLessonDto,
  MyLessonDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  createLessonTestHelpers,
  FROM,
  STARTS_AT,
  TO,
} from './e2e-support/lessons-fixtures';

describe('Теги дат занятий (e2e, ADR-0075)', () => {
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
      tags: ['  Дракон ', 'дракон', 'начинающие'],
    });

    expect(created.status).toBe(201);
    expect((created.body as LessonDto).tags).toEqual(['Дракон', 'начинающие']);

    const list = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', cookie);
    const dto = (list.body as LessonDto[]).find(
      (l) => l.id === (created.body as LessonDto).id,
    );
    expect(dto?.tags).toEqual(['Дракон', 'начинающие']);
  });

  it('PATCH с тегами нормализует и заменяет прежний набор', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();
    const created = await postLesson(cookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['раз'],
    });

    const patched = await patchLesson(cookie, (created.body as LessonDto).id, {
      tags: ['Два', 'два', '  Три  '],
    });

    expect(patched.status).toBe(200);
    expect((patched.body as LessonDto).tags).toEqual(['Два', 'Три']);
  });

  it('PATCH без tags — прежние теги остаются на месте', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();
    const created = await postLesson(cookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['дракон'],
    });

    const patched = await patchLesson(cookie, (created.body as LessonDto).id, {
      topic: 'Разбор толчка руками',
    });

    expect(patched.status).toBe(200);
    expect((patched.body as LessonDto).tags).toEqual(['дракон']);
  });

  it('GET /api/lessons?tag= фильтрует по тегу', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();
    const tagged = await postLesson(cookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['дракон'],
    });
    await postLesson(cookie, {
      classId,
      startsAt: '2026-09-04T16:00:00Z',
    });

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO, tag: 'дракон' })
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
      tags: ['а'.repeat(41)],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('ученик: GET /me/lessons (предстоящие) отдаёт теги', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const classId = await createClass();
    // /me/lessons фильтрует «вперёд от настоящего now» (MyLessonsService),
    // не от FROM/TO окна остальных сценариев — дата должна быть в будущем
    // относительно реальных часов, а не только внутри тестового окна.
    await postLesson(teacherCookie, {
      classId,
      startsAt: '2099-01-01T16:00:00Z',
      tags: ['начинающие'],
    });

    const studentCookie = await sessionFor([]);
    const res = await request(server())
      .get('/api/me/lessons')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const list = res.body as MyLessonDto[];
    expect(list.some((l) => l.tags.includes('начинающие'))).toBe(true);
  });

  it('ученик: GET /me/lessons/archive (прошедшие) тоже отдаёт теги', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const classId = await createClass();
    // STARTS_AT (2026-09-03) — в прошлом относительно реальных часов теста,
    // архив отдаёт занятия строго до now (MyLessonsArchiveService).
    const created = await postLesson(teacherCookie, {
      classId,
      startsAt: STARTS_AT,
      tags: ['дракон'],
    });
    // Запись обязательна (ADR-0114) — без неё дата не попадёт в архив вовсе,
    // а этот тест проверяет именно теги, не правило про запись.
    const lessonId = (created.body as LessonDto).id;
    const addedRecording = await withCsrf(
      request(server()).post(`/api/lessons/${lessonId}/recording`),
    )
      .set('Cookie', teacherCookie)
      .send({ title: 'Запись занятия', url: 'https://cloud.example/tags-archive-rec' });
    expect(addedRecording.status).toBe(201);

    const studentCookie = await sessionFor([]);
    const res = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const list = res.body as MyArchivedLessonDto[];
    expect(list.some((l) => l.tags.includes('дракон'))).toBe(true);
  });

  it('ученик: GET /lessons?tag= — 403, как и без фильтра', async () => {
    const cookie = await sessionFor([]);

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO, tag: 'дракон' })
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
  });
});
