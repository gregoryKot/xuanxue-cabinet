// e2e на владение /me/exams (ТЗ student-api.md, SECURITY §3) — данные
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
