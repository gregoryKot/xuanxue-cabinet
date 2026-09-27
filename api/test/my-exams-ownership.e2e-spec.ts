// e2e на владение /me/exams (ТЗ docs/PLAN.md §11, SECURITY §3) — данные
// ученика: своя попытка, чужая не должна повлиять на положение по форме.
// Список форм — школьные данные (только опубликованные, доступны любой
// роли), а вот attemptsUsed/lastAttempt — по владельцу из сессии. Настоящий
// AppModule на MongoMemoryServer, образец — exam-attempts-ownership.e2e-spec.ts.
import type {
  ApiErrorBody,
  ExamAttemptDto,
  ExamDto,
  ExamItemDto,
  MyExamDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('/me/exams — владение (e2e)', () => {
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

  async function createPublishedExam(teacherCookie: string): Promise<string> {
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

    return examId;
  }

  it('А начал попытку — у Б своё положение по той же форме (0, без lastAttempt)', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);

    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', cookieA);

    const listA = await request(server()).get('/api/me/exams').set('Cookie', cookieA);
    const examA = (listA.body as MyExamDto[]).find((e) => e.id === examId);
    expect(examA?.attemptsUsed).toBe(1);
    expect(examA?.lastAttempt).toEqual({
      id: (started.body as ExamAttemptDto).id,
      status: 'in_progress',
      expired: false,
    });

    const listB = await request(server()).get('/api/me/exams').set('Cookie', cookieB);
    const examB = (listB.body as MyExamDto[]).find((e) => e.id === examId);
    expect(examB?.attemptsUsed).toBe(0);
    expect(examB?.lastAttempt).toBeUndefined();
  });

  it('гость без роли видит опубликованные формы школы, как ученик', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);
    const guestCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server()).get('/api/me/exams').set('Cookie', guestCookie);

    expect(res.status).toBe(200);
    expect((res.body as MyExamDto[]).map((e) => e.id)).toContain(examId);
  });

  it('без сессии — 401', async () => {
    const res = await request(server()).get('/api/me/exams');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  // ADR-0129 (отзыв тестировщицы 2026-09-23): пилюля у колокольчика гаснет
  // по нажатию на карточку, не по старту попытки.
  it('POST .../seen без сессии — 401', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);

    const res = await withCsrf(request(server()).post(`/api/me/exams/${examId}/seen`));

    expect(res.status).toBe(401);
  });

  it('read-after-write: отметил — свой GET /me/exams вернул seen: true, у другого ученика — false', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });

    const before = await request(server()).get('/api/me/exams').set('Cookie', cookieA);
    expect((before.body as MyExamDto[]).find((e) => e.id === examId)?.seen).toBe(false);

    const marked = await withCsrf(
      request(server()).post(`/api/me/exams/${examId}/seen`),
    ).set('Cookie', cookieA);
    expect(marked.status).toBe(200);
    expect((marked.body as MyExamDto[]).find((e) => e.id === examId)?.seen).toBe(true);

    const afterA = await request(server()).get('/api/me/exams').set('Cookie', cookieA);
    expect((afterA.body as MyExamDto[]).find((e) => e.id === examId)?.seen).toBe(true);

    const afterB = await request(server()).get('/api/me/exams').set('Cookie', cookieB);
    expect((afterB.body as MyExamDto[]).find((e) => e.id === examId)?.seen).toBe(false);
  });

  it('неизвестный id формы — 404', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(
      request(server()).post('/api/me/exams/507f1f77bcf86cd799439099/seen'),
    ).set('Cookie', cookie);

    expect(res.status).toBe(404);
  });

  it('черновик формы (не опубликован) — 400, отказ ученику', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'text', prompt: 'Опишите форму' });
    const itemId = (item.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    const draft = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({ title: 'Черновик', blocks: [{ itemIds: [itemId] }] });
    const draftId = (draft.body as ExamDto).id;
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(
      request(server()).post(`/api/me/exams/${draftId}/seen`),
    ).set('Cookie', cookie);

    expect(res.status).toBe(400);
  });

  it('в ответе нет ни блоков формы, ни правильных ответов — только положение', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const examId = await createPublishedExam(teacherCookie);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await request(server()).get('/api/me/exams').set('Cookie', cookie);
    const exam = (res.body as MyExamDto[]).find((e) => e.id === examId);

    expect(exam).not.toHaveProperty('blocks');
    expect(exam).not.toHaveProperty('result');
    expect(JSON.stringify(res.body)).not.toContain('correct');
  });
});
