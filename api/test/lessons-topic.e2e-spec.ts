// e2e на POST /lessons/topic (ADR-0197) — данные школы (ADR-0010): доступ по
// роли. Запись и пересборка — lessons-topic.service.spec.ts; здесь вход,
// валидация и read-after-write через настоящий GET /lessons.
import request from 'supertest';
import { LESSON_LIMITS, type ApiErrorBody, type LessonDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  createLessonTestHelpers,
  FROM,
  STARTS_AT,
  TO,
} from './e2e-support/lessons-fixtures';

const UNKNOWN_ID = '000000000000000000000000';

describe('POST /lessons/topic (e2e)', () => {
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

  function setTopic(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/lessons/topic'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function createTwo(cookie: string): Promise<string[]> {
    const classId = await createClass();
    const first = await postLesson(cookie, { classId, startsAt: STARTS_AT });
    const second = await postLesson(cookie, {
      classId,
      startsAt: '2026-09-04T16:00:00Z',
    });
    return [(first.body as LessonDto).id, (second.body as LessonDto).id];
  }

  it('без cookie — 401 в конверте', async () => {
    const res = await withCsrf(request(server()).post('/api/lessons/topic')).send({
      topic: 'Т',
      lessonIds: [UNKNOWN_ID],
    });
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик — 403', async () => {
    const res = await setTopic(await sessionFor([]), {
      topic: 'Т',
      lessonIds: [UNKNOWN_ID],
    });
    expect(res.status).toBe(403);
  });

  it('учитель: тема записана в оба занятия и видна в GET /lessons (read-after-write)', async () => {
    const cookie = await sessionFor(['teacher']);
    const ids = await createTwo(cookie);

    const res = await setTopic(cookie, { topic: 'Шаги назад', lessonIds: ids });
    expect(res.status).toBe(200);
    expect((res.body as LessonDto[]).map((l) => l.id)).toEqual(ids);

    const list = await request(server())
      .get(`/api/lessons?from=${FROM}&to=${TO}&limit=50`)
      .set('Cookie', cookie);
    const topics = (list.body as LessonDto[]).map((l) => l.topic);
    expect(topics).toEqual(['Шаги назад', 'Шаги назад']);
  });

  it('пустой список id — 400', async () => {
    const res = await setTopic(await sessionFor(['teacher']), {
      topic: 'Т',
      lessonIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('тема длиннее лимита — 400', async () => {
    const res = await setTopic(await sessionFor(['teacher']), {
      topic: 'я'.repeat(LESSON_LIMITS.topic + 1),
      lessonIds: [UNKNOWN_ID],
    });
    expect(res.status).toBe(400);
  });

  it('неизвестный id — 404', async () => {
    const res = await setTopic(await sessionFor(['teacher']), {
      topic: 'Т',
      lessonIds: [UNKNOWN_ID],
    });
    expect(res.status).toBe(404);
  });
});
