// PLAN.md §11 «Автосохранение: ответ пережил закрытие вкладки» — кабинет
// после закрытия вкладки поднимает попытку заново тем же GET /attempts
// (useAttempt.ts), и ответ обязан быть уже там, а не только в ответе на сам
// PATCH (read-after-write, CLAUDE.md «Тесты»). Отдельный файл от
// exam-attempts.e2e-spec.ts (файл-лимит, тот же приём, что
// exam-attempts-deadline.e2e-spec.ts; общий хелпер — exam-attempts-fixtures.ts).
// Настоящий AppModule на MongoMemoryServer.
import type { ExamAttemptDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Автосохранение попытки переживает закрытие вкладки (e2e)', () => {
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

  it('сохранённый ответ виден в свежем GET /attempts, не только в ответе на PATCH', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId, itemId, optionIds } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor([]);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;

    const saved = await withCsrf(
      request(server()).patch(`/api/attempts/${attemptId}/answers`),
    )
      .set('Cookie', studentCookie)
      .send({ answers: [{ itemId, optionIds: [optionIds[1]] }] });
    expect(saved.status).toBe(200);

    // «Открыли вкладку заново» — новый запрос без состояния клиента.
    const reopened = await request(server())
      .get('/api/attempts')
      .set('Cookie', studentCookie);
    const attempt = (reopened.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.status).toBe('in_progress');
    expect(attempt?.answers).toEqual([{ itemId, optionIds: [optionIds[1]] }]);
  });
});
