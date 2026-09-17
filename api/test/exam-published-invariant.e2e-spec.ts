// e2e на реальный HTTP-путь двух блокеров аудита 2026-09-15: опубликованную
// форму нельзя сохранить пустой (№3), а форму, по которой уже сдавали, —
// удалить (№4). Отдельный файл, не exams.e2e-spec.ts — тот уже у потолка
// file-size-ratchet (CLAUDE.md «Храповики»), новый смысл — новый файл.
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

  it('DELETE формы, по которой уже стартовали попытку, — 409, форма остаётся', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor([]);
    await withCsrf(request(server()).post(`/api/exams/${examId}/attempts`)).set(
      'Cookie',
      studentCookie,
    );
    // Учитель откатывает форму в черновик — раньше это открывало removeIfDraft
    // дорогу к удалению формы с чужими попытками (блокер №4).
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'draft' });

    const res = await withCsrf(request(server()).delete(`/api/exams/${examId}`)).set(
      'Cookie',
      teacherCookie,
    );

    expect(res.status).toBe(409);
    expect((res.body as ApiErrorBody).message).toContain('попытки учеников');

    const stillThere = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect(stillThere.status).toBe(200);
  });
});
