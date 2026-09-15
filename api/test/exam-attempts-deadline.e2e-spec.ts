// Дедлайн экзамена закрывает попытку без действия ученика (блокер аудита
// 2026-09-15, ТЗ 4.4 п.7) — отдельный файл от exam-attempts.e2e-spec.ts
// (файл-лимит спеков, тот же приём, что lessons-broadcast-status.e2e-spec.ts,
// CLAUDE.md «Файлы»/«Храповики»; общий хелпер — exam-attempts-fixtures.ts).
// Настоящий AppModule на MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { ExamAttemptDto } from '@xuanxue/shared';
import request from 'supertest';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { ExamDeadlineCloseService } from '../src/exams/exam-deadline-close.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Дедлайн экзамена без действия ученика (e2e)', () => {
  let testApp: TestApp;
  const { server, sessionFor, createPublishedExam } = createExamAttemptsTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  // Блокер аудита 2026-09-15 (ТЗ 4.4, п.7): раньше дедлайн закрывал попытку
  // только лениво, когда кто-то трогал ИМЕННО её (start/saveAnswers/submit/
  // list той же попытки) — учитель просит `GET /attempts?status=submitted`,
  // фильтр по статусу уходит в Mongo раньше ленивого закрытия, и просроченная
  // `in_progress`-попытка под фильтр не подходит и в выборку не попадает.
  // Здесь ученик попытку не трогает вовсе (бросил, не вернулся) — только шаг
  // тика ExamDeadlineCloseService видит дедлайн и закрывает её сам.
  it('попытка, просроченная по дедлайну и брошенная учеником, появляется в очереди проверки после шага «дедлайны экзаменов»', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor([]);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;

    // Дедлайн в реальном сценарии ставит exam-attempt-start.ts при старте —
    // здесь нужен уже прошедший, переносим его в прошлое напрямую в Mongo
    // (тот же приём, что recordingPromptedAt в lessons.e2e-spec.ts).
    const attemptModel = testApp.app.get<Model<ExamAttemptRecord>>(
      getModelToken(ExamAttemptRecord.name),
      { strict: false },
    );
    await attemptModel.updateOne(
      { _id: attemptId },
      { $set: { deadlineAt: new Date(Date.now() - 60_000) } },
    );

    // До тика очередь просроченную попытку не видит — тот самый баг.
    const beforeTick = await request(server())
      .get('/api/attempts')
      .query({ status: 'submitted' })
      .set('Cookie', teacherCookie);
    expect((beforeTick.body as ExamAttemptDto[]).some((a) => a.id === attemptId)).toBe(
      false,
    );

    await testApp.app
      .get(ExamDeadlineCloseService, { strict: false })
      .closeDue(DateTime.utc());

    const afterTick = await request(server())
      .get('/api/attempts')
      .query({ status: 'submitted' })
      .set('Cookie', teacherCookie);
    const found = (afterTick.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(found).toBeDefined();
    expect(found?.expired).toBe(true);

    // Второй тик (повтор/второй инстанс при деплое) — идемпотентно, та же
    // попытка не плодит вторую запись и не меняет статус второй раз (файл
    // не чистит коллекцию между тестами — в очереди могут быть чужие
    // попытки других сценариев этого же файла, поэтому считаем вхождения
    // именно нашей попытки, а не длину всего списка).
    await testApp.app
      .get(ExamDeadlineCloseService, { strict: false })
      .closeDue(DateTime.utc());
    const afterSecondTick = await request(server())
      .get('/api/attempts')
      .query({ status: 'submitted' })
      .set('Cookie', teacherCookie);
    expect(
      (afterSecondTick.body as ExamAttemptDto[]).filter((a) => a.id === attemptId),
    ).toHaveLength(1);
  });
});
