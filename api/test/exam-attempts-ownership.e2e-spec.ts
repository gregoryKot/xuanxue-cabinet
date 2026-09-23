// e2e на владение попыткой (ADR-0022, SECURITY §3) — данные ученика: ученик
// А не должен читать, сохранять или сдавать попытку ученика Б (чеклист
// CLAUDE.md «Новая коллекция», e2e-support/README.md «данные ученика»).
// Настоящий AppModule на MongoMemoryServer.
import type { ApiErrorBody, ExamAttemptDto, ExamDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Exam attempts — владение (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function createPublishedExam(teacherCookie: string): Promise<{
    examId: string;
    itemId: string;
  }> {
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'text', prompt: 'Опишите форму «пэнбу»' });
    const itemId = (item.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({ title: 'Экзамен', blocks: [{ itemIds: [itemId] }] });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    return { examId, itemId };
  }

  it('ученик Б не читает, не сохраняет и не сдаёт попытку ученика А', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { examId, itemId } = await createPublishedExam(teacherCookie);

    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });

    const startedA = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', cookieA);
    const attemptId = (startedA.body as ExamAttemptDto).id;

    // А читает свою попытку своим адресом (ADR-0124) — 200.
    const getByA = await request(server())
      .get(`/api/attempts/${attemptId}`)
      .set('Cookie', cookieA);
    expect(getByA.status).toBe(200);
    expect((getByA.body as ExamAttemptDto).id).toBe(attemptId);

    // Б читает попытку А тем же адресом — не найдена, не 403 (SECURITY §3):
    // не подтверждаем даже факт её существования.
    const getByB = await request(server())
      .get(`/api/attempts/${attemptId}`)
      .set('Cookie', cookieB);
    expect(getByB.status).toBe(404);
    expect((getByB.body as ApiErrorBody).code).toBe('not_found');

    // Б пробует сохранить ответ в попытке А — не найдена, не 200.
    const saveByB = await withCsrf(
      request(server()).patch(`/api/attempts/${attemptId}/answers`),
    )
      .set('Cookie', cookieB)
      .send({ answers: [{ itemId, text: 'подмена ответа' }] });
    expect(saveByB.status).toBe(404);
    expect((saveByB.body as ApiErrorBody).code).toBe('not_found');

    // Б пробует сдать попытку А — тоже не найдена.
    const submitByB = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/submit`),
    ).set('Cookie', cookieB);
    expect(submitByB.status).toBe(404);

    // Попытка А осталась нетронутой — Б её не подменил и не сдал за А.
    const listA = await request(server())
      .get('/api/attempts')
      .query({ examId })
      .set('Cookie', cookieA);
    const attemptA = (listA.body as ExamAttemptDto[])[0];
    expect(attemptA?.status).toBe('in_progress');
    expect(attemptA?.answers).toEqual([]);

    // Б не видит попытку А в своём списке — только свои (пустой список).
    const listB = await request(server())
      .get('/api/attempts')
      .query({ examId })
      .set('Cookie', cookieB);
    expect(listB.body as ExamAttemptDto[]).toEqual([]);
  });

  it('старт от А и от Б по одной форме — две разные попытки, обе видны учителю', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });

    const startedA = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', cookieA);
    const startedB = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', cookieB);

    expect((startedA.body as ExamAttemptDto).id).not.toBe(
      (startedB.body as ExamAttemptDto).id,
    );

    const teacherList = await request(server())
      .get('/api/attempts')
      .query({ examId })
      .set('Cookie', teacherCookie);
    expect(teacherList.body as ExamAttemptDto[]).toHaveLength(2);
  });
});
