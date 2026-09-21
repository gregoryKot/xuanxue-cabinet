// e2e на число попыток экзамена (`GET /exams/:examId/attempt-count`,
// ADR-0022) — отдельный файл, не exam-attempts.e2e-spec.ts: тот уже на
// потолке файлового храповика (CLAUDE.md «Файлы»/«Храповики»), тот же приём,
// что exam-questions-per-attempt.e2e-spec.ts. Настоящий AppModule на
// MongoMemoryServer — доступ у ручки по роли (ADR-0010), поэтому обязателен
// 403 у ученика (CLAUDE.md «Новый эндпоинт = DTO + e2e на владение»).
import type { ExamAttemptCountDto, ExamAttemptDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Число попыток экзамена (e2e)', () => {
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

  it('учитель получает число попыток экзамена', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor([]);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;

    const before = await request(server())
      .get(`/api/exams/${examId}/attempt-count`)
      .set('Cookie', teacherCookie);
    expect(before.status).toBe(200);
    expect((before.body as ExamAttemptCountDto).total).toBe(1);

    // Сдана — тоже считается (задача: и идущие, и сданные).
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );

    const after = await request(server())
      .get(`/api/exams/${examId}/attempt-count`)
      .set('Cookie', teacherCookie);
    expect(after.status).toBe(200);
    expect((after.body as ExamAttemptCountDto).total).toBe(1);
  });

  it('ученик получает 403', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor([]);

    const res = await request(server())
      .get(`/api/exams/${examId}/attempt-count`)
      .set('Cookie', studentCookie);

    expect(res.status).toBe(403);
  });
});
