// e2e очереди проверки без снимка формы (`GET /attempts/queue`, аудит
// 2026-10-01 F33, ADR-0126 «Последствия»). Настоящий AppModule на
// MongoMemoryServer. Данные школы, по роли (ADR-0010): штату — строки без
// `blocks`/`answers`/`media`, ученику — 403, без сессии — 401 (CLAUDE.md
// «Новый эндпоинт = DTO + e2e на владение»). Сам 200 со списком заодно
// держит порядок контроллеров в exams.module.ts: окажись `attempts/:id`
// раньше, `queue` стал бы id и ответил 404.
import type { ExamAttemptDto, ExamAttemptQueueItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Очередь проверки без снимка (e2e, F33)', () => {
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

  async function submittedAttempt(teacherCookie: string, studentCookie: string) {
    const { examId } = await createPublishedExam(teacherCookie);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );
    return attemptId;
  }

  it('штат получает строки очереди без blocks/answers/media, с именем ученика', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const studentCookie = await sessionFor([]);
    const attemptId = await submittedAttempt(teacherCookie, studentCookie);

    const res = await request(server())
      .get('/api/attempts/queue?status=submitted&limit=200')
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    const rows = res.body as ExamAttemptQueueItemDto[];
    const row = rows.find((item) => item.id === attemptId);
    expect(row).toMatchObject({
      id: attemptId,
      status: 'submitted',
      examTitle: 'Экзамен по третьей форме',
      expired: false,
    });
    expect(typeof row?.userName).toBe('string');
    expect(row).not.toHaveProperty('blocks');
    expect(row).not.toHaveProperty('answers');
    expect(row).not.toHaveProperty('media');
  });

  it('после оценки работа уходит из сданных в проверенные с итогом (read-after-write)', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const studentCookie = await sessionFor([]);
    const attemptId = await submittedAttempt(teacherCookie, studentCookie);
    await withCsrf(request(server()).put(`/api/attempts/${attemptId}/grading`))
      .set('Cookie', teacherCookie)
      .send({ outcome: 'passed' });

    const graded = await request(server())
      .get('/api/attempts/queue?status=graded')
      .set('Cookie', teacherCookie);
    const submitted = await request(server())
      .get('/api/attempts/queue?status=submitted')
      .set('Cookie', teacherCookie);

    const row = (graded.body as ExamAttemptQueueItemDto[]).find(
      (item) => item.id === attemptId,
    );
    expect(row?.outcome).toBe('passed');
    expect(typeof row?.gradedAt).toBe('string');
    expect(
      (submitted.body as ExamAttemptQueueItemDto[]).some((item) => item.id === attemptId),
    ).toBe(false);
  });

  it('помощник и админ — 200, как учитель (данные школы, по роли)', async () => {
    for (const role of ['assistant', 'admin'] as const) {
      const res = await request(server())
        .get('/api/attempts/queue')
        .set('Cookie', await sessionFor([role]));
      expect(res.status).toBe(200);
    }
  });

  it('ученик — 403, без сессии — 401', async () => {
    const asStudent = await request(server())
      .get('/api/attempts/queue?status=submitted')
      .set('Cookie', await sessionFor([]));
    expect(asStudent.status).toBe(403);

    const anonymous = await request(server()).get('/api/attempts/queue');
    expect(anonymous.status).toBe(401);
  });

  it('кривой query (неизвестный статус) — 400, не пустой список', async () => {
    const res = await request(server())
      .get('/api/attempts/queue?status=unknown')
      .set('Cookie', await sessionFor(['teacher']));

    expect(res.status).toBe(400);
  });
});
