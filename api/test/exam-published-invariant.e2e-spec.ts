// e2e на реальный HTTP-путь блокера аудита 2026-09-15 №3: опубликованную
// форму нельзя сохранить пустой. Блокер №4 (удаление формы с попытками)
// владелец снял по ADR-0140 — второй тест ниже проверяет новое поведение:
// удаляется без отказа, попытка остаётся в базе. Отдельный файл, не
// exams.e2e-spec.ts — тот уже у потолка file-size-ratchet (CLAUDE.md
// «Храповики»).
import type { ApiErrorBody, ExamDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Инвариант опубликованной формы (e2e)', () => {
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

  it('PATCH уже опубликованной формы с пустыми blocks — 400, форма не меняется', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId, itemId } = await createPublishedExam(teacherCookie);

    const res = await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ blocks: [] });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toContain('нет ни одного вопроса');

    const stillThere = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect((stillThere.body as ExamDto).status).toBe('published');
    expect((stillThere.body as ExamDto).blocks[0]?.itemIds).toEqual([itemId]);
  });

  it('DELETE формы, по которой уже стартовали попытку, — 204 (ADR-0140), форма пропадает', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor([]);
    await withCsrf(request(server()).post(`/api/exams/${examId}/attempts`)).set(
      'Cookie',
      studentCookie,
    );

    const res = await withCsrf(request(server()).delete(`/api/exams/${examId}`)).set(
      'Cookie',
      teacherCookie,
    );
    expect(res.status).toBe(204);

    const gone = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect(gone.status).toBe(404);
  });
});
