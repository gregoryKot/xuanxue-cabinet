// e2e на статус рассылки ссылки на карточке даты занятия (docs/PLAN.md §6
// п.3) — вынесено из lessons.e2e-spec.ts, чтобы оба файла уместились в лимит
// файл-храповика (CLAUDE.md «Храповики»); общие хелперы, модели и константы
// окна — lessons-fixtures.ts (то же приложение и роли, что и в основном
// спеке на /lessons).
import request from 'supertest';
import type { LessonDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createLessonTestHelpers,
  FROM,
  STARTS_AT,
  TO,
} from './e2e-support/lessons-fixtures';

describe('Lessons broadcast status (e2e)', () => {
  let testApp: TestApp;
  const {
    server,
    sessionFor,
    classModel,
    lessonModel,
    broadcastModel,
    createClass,
    postLesson,
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
    await broadcastModel().deleteMany({});
  });

  it('GET /lessons: занятие с рассылкой ссылки — поле broadcast, без рассылки — поля нет', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();
    const withLink = await postLesson(cookie, { classId, startsAt: STARTS_AT });
    const withoutLink = await postLesson(cookie, {
      classId,
      startsAt: '2026-09-04T16:00:00Z',
    });
    await broadcastModel().create({
      kind: 'lesson_link',
      lessonId: (withLink.body as LessonDto).id,
      text: 'Ссылка на занятие',
      scheduledAt: new Date(STARTS_AT),
      channelIds: [],
      status: 'scheduled',
    });

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', cookie);
    const list = res.body as LessonDto[];
    const withLinkDto = list.find((l) => l.id === (withLink.body as LessonDto).id);
    const withoutLinkDto = list.find((l) => l.id === (withoutLink.body as LessonDto).id);
    expect(withLinkDto?.broadcast).toEqual({ status: 'scheduled', kind: 'lesson_link' });
    expect(withoutLinkDto?.broadcast).toBeUndefined();
  });
});
