// e2e на /lessons/recording-summary (ТЗ docs/PLAN.md §14, слой 3.5) — данные
// школы (ADR-0010): доступ по роли, не по владельцу. Настоящий AppModule на
// MongoMemoryServer — тот же гвард, что видит браузер (e2e-support/README.md).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import request from 'supertest';
import type { LessonRecordingSummaryDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createLessonTestHelpers } from './e2e-support/lessons-fixtures';

describe('Lessons recording summary (e2e)', () => {
  let testApp: TestApp;
  const { server, sessionFor, classModel, lessonModel, createClass } =
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

  it('без cookie — 401; ученик — 403', async () => {
    const anon = await request(server()).get('/api/lessons/recording-summary');
    expect(anon.status).toBe(401);

    const cookie = await sessionFor([]);
    const res = await request(server())
      .get('/api/lessons/recording-summary')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('учитель — 200, числа за 30 дней по настоящим занятиям', async () => {
    const classId = await createClass();
    const now = DateTime.utc();
    await lessonModel().create({
      classId: new Types.ObjectId(classId),
      startsAt: now.minus({ days: 5 }).toJSDate(),
      durationMin: 60,
      topic: 'Форма 24',
      recordings: [{ title: 'Запись', url: 'https://cloud.example/rec' }],
    });
    await lessonModel().create({
      classId: new Types.ObjectId(classId),
      startsAt: now.minus({ days: 6 }).toJSDate(),
      durationMin: 60,
      topic: 'Форма 24',
    });
    await lessonModel().create({
      classId: new Types.ObjectId(classId),
      startsAt: now.minus({ days: 40 }).toJSDate(),
      durationMin: 60,
      topic: 'Вне окна',
    });

    const cookie = await sessionFor(['teacher']);
    const res = await request(server())
      .get('/api/lessons/recording-summary')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const dto = res.body as LessonRecordingSummaryDto;
    expect(dto).toEqual({ periodDays: 30, lessonsPast: 2, lessonsWithRecording: 1 });
  });
});
