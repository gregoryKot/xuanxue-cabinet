// Отказ «Сдать» при пропущенном объяснении (ADR-0146) — отдельный файл от
// exam-attempts.e2e-spec.ts (файл-лимит спеков, CLAUDE.md «Файлы»; общий
// хелпер — exam-attempts-fixtures.ts). Настоящий AppModule на MongoMemoryServer.
import type { ApiErrorBody, ExamAttemptDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Отказ сдачи при пропущенном объяснении (e2e, ADR-0146)', () => {
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

  async function startAttempt(studentCookie: string) {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId, itemId, optionIds } = await createPublishedExam(teacherCookie, {
      askReason: true,
    });
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    return { attemptId: (started.body as ExamAttemptDto).id, itemId, optionIds };
  }

  it('выбран вариант, объяснение не написано — POST submit 400 с понятным текстом', async () => {
    const cookie = await sessionFor([]);
    const { attemptId, itemId, optionIds } = await startAttempt(cookie);
    await withCsrf(request(server()).patch(`/api/attempts/${attemptId}/answers`))
      .set('Cookie', cookie)
      .send({ answers: [{ itemId, optionIds: [optionIds[0]] }] });

    const submitted = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/submit`),
    ).set('Cookie', cookie);

    expect(submitted.status).toBe(400);
    expect((submitted.body as ApiErrorBody).message).toContain('Объясните свой ответ');
  });

  it('выбран вариант и написано объяснение — submit 200, statuses submitted', async () => {
    const cookie = await sessionFor([]);
    const { attemptId, itemId, optionIds } = await startAttempt(cookie);
    await withCsrf(request(server()).patch(`/api/attempts/${attemptId}/answers`))
      .set('Cookie', cookie)
      .send({ answers: [{ itemId, optionIds: [optionIds[0]], text: 'потому что так' }] });

    const submitted = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/submit`),
    ).set('Cookie', cookie);

    expect(submitted.status).toBe(200);
    expect((submitted.body as ExamAttemptDto).status).toBe('submitted');
  });

  it('вопрос пропущен целиком — submit 200 (пропуск остаётся правом ученика)', async () => {
    const cookie = await sessionFor([]);
    const { attemptId } = await startAttempt(cookie);

    const submitted = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/submit`),
    ).set('Cookie', cookie);

    expect(submitted.status).toBe(200);
    expect((submitted.body as ExamAttemptDto).status).toBe('submitted');
  });

  it('POST /exam-items с askReason:true у text — 400 в конверте', async () => {
    const cookie = await sessionFor(['teacher']);
    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Опишите форму', askReason: true });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('POST /exam-items с askReason:true у single — 201, GET отдаёт askReason:true (read-after-write)', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({
        kind: 'single',
        prompt: 'Сколько форм?',
        askReason: true,
        options: [
          { text: 'A', correct: true },
          { text: 'B', correct: false },
        ],
      });
    expect(created.status).toBe(201);
    const dto = created.body as ExamItemDto;
    expect(dto.askReason).toBe(true);

    const fetched = await request(server())
      .get(`/api/exam-items/${dto.id}`)
      .set('Cookie', cookie);
    expect((fetched.body as ExamItemDto).askReason).toBe(true);
  });
});
