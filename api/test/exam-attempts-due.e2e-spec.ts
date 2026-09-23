// Срок сдачи экзамена (ADR-0125) — второе, независимое от лимита времени
// ограничение: закрывает только НОВЫЕ попытки, уже идущую не трогает
// никогда (решение владельца 2026-09-22). Отдельный файл от
// exam-attempts.e2e-spec.ts/exams.e2e-spec.ts (файл-лимит спеков, CLAUDE.md
// «Файлы»). Настоящий AppModule на MongoMemoryServer — `start()` берёт
// «сейчас» из `DateTime.utc()` внутри контроллера (не параметр запроса),
// поэтому срок здесь ставится относительно реального времени теста, тем же
// приёмом, что дедлайн попытки в exam-attempts-deadline.e2e-spec.ts.
import { DateTime } from 'luxon';
import {
  EXAM_DUE_PASSED_MESSAGE,
  type ApiErrorBody,
  type ExamAttemptDto,
  type ExamDto,
  type MyExamDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Срок сдачи экзамена (e2e)', () => {
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

  function future(): string {
    return DateTime.utc().plus({ days: 7 }).toISO();
  }

  function past(): string {
    return DateTime.utc().minus({ days: 1 }).toISO();
  }

  it('read-after-write: срок сдачи виден и учителю (GET /exams/:id), и ученику (GET /me/exams)', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const dueAt = future();
    const { examId } = await createPublishedExam(teacherCookie, { dueAt });

    const asTeacher = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect((asTeacher.body as ExamDto).dueAt).toBe(dueAt);

    const studentCookie = await sessionFor([]);
    const asStudent = await request(server())
      .get('/api/me/exams')
      .set('Cookie', studentCookie);
    const seen = (asStudent.body as MyExamDto[]).find((exam) => exam.id === examId);
    expect(seen?.dueAt).toBe(dueAt);
  });

  it('PATCH { dueAt: null } — сброс, поля нет ни в ответе, ни у ученика', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie, { dueAt: future() });

    const patched = await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ dueAt: null });
    expect(patched.status).toBe(200);
    expect(patched.body as Record<string, unknown>).not.toHaveProperty('dueAt');

    const studentCookie = await sessionFor([]);
    const asStudent = await request(server())
      .get('/api/me/exams')
      .set('Cookie', studentCookie);
    const seen = (asStudent.body as MyExamDto[]).find((exam) => exam.id === examId);
    expect(seen).not.toHaveProperty('dueAt');
  });

  it('срок в будущем — старт попытки как обычно', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie, { dueAt: future() });
    const studentCookie = await sessionFor([]);

    const res = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect(res.status).toBe(201);
    expect((res.body as ExamAttemptDto).status).toBe('in_progress');
  });

  it('срок прошёл, попытки не было — 400, попытка не создаётся', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie, { dueAt: past() });
    const studentCookie = await sessionFor([]);

    const res = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(EXAM_DUE_PASSED_MESSAGE);

    const list = await request(server())
      .get('/api/attempts')
      .query({ examId })
      .set('Cookie', teacherCookie);
    expect(list.body as ExamAttemptDto[]).toHaveLength(0);
  });

  // Самое важное следствие правила (предупреждение владельца): ученик,
  // сдающий прямо сейчас, перезагружает страницу после дедлайна и снова
  // шлёт тот же POST /exams/:id/attempts (start() при незаконченной попытке
  // возвращает её, а не отказ) — «Продолжить» обязан сработать.
  it('срок прошёл, попытка уже идёт — повторный POST всё равно отдаёт её, не 400', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie, { dueAt: future() });
    const studentCookie = await sessionFor([]);

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    expect(started.status).toBe(201);
    const attemptId = (started.body as ExamAttemptDto).id;

    // Срок наступает уже после старта — учитель мог поставить его и позже,
    // а попытка тем временем идёт (тот же сценарий, что в юнит-тесте сервиса).
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ dueAt: past() });

    const again = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect(again.status).toBe(201);
    expect((again.body as ExamAttemptDto).id).toBe(attemptId);
    expect((again.body as ExamAttemptDto).status).toBe('in_progress');
  });
});
