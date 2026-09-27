// e2e на реальный HTTP-путь ADR-0140: экзамен и вопрос удаляются в любом
// статусе, без отказа (решение владельца, 2026-09-27). Read-after-write через
// настоящие точки входа кабинета и `/me/exams` — не вызов сервиса напрямую
// (CLAUDE.md «Тесты»).
import type { ExamDto, ExamItemDto, MyExamDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Мягкое удаление формы и вопроса (e2e, ADR-0140)', () => {
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

  async function publishedItemAndExam(
    cookie: string,
  ): Promise<{ itemId: string; examId: string }> {
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Опишите стойку «мабу»' });
    const itemId = (item.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', cookie)
      .send({ status: 'published' });

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({ title: 'Экзамен по стойкам', blocks: [{ itemIds: [itemId] }] });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', cookie)
      .send({ status: 'published' });

    return { itemId, examId };
  }

  it('учитель удаляет опубликованную форму — пропадает из /exams и /me/exams', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const studentCookie = await sessionCookieFor(testApp.app, []);
    const { examId } = await publishedItemAndExam(teacherCookie);

    const deleteRes = await withCsrf(
      request(server()).delete(`/api/exams/${examId}`),
    ).set('Cookie', teacherCookie);
    expect(deleteRes.status).toBe(204);

    const list = await request(server()).get('/api/exams').set('Cookie', teacherCookie);
    expect((list.body as ExamDto[]).some((e) => e.id === examId)).toBe(false);

    const byId = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect(byId.status).toBe(404);

    const myExams = await request(server())
      .get('/api/me/exams')
      .set('Cookie', studentCookie);
    expect((myExams.body as MyExamDto[]).some((e) => e.id === examId)).toBe(false);
  });

  it('ученик: DELETE /exams/:id — 403, форма не пострадала', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const studentCookie = await sessionCookieFor(testApp.app, []);
    const { examId } = await publishedItemAndExam(teacherCookie);

    const res = await withCsrf(request(server()).delete(`/api/exams/${examId}`)).set(
      'Cookie',
      studentCookie,
    );
    expect(res.status).toBe(403);

    const stillThere = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect(stillThere.status).toBe(200);
  });

  it('ученик: GET /exam-items?includeDeleted=true — 403 (редактор формы, не банк ученику)', async () => {
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/exam-items')
      .query({ includeDeleted: true })
      .set('Cookie', studentCookie);

    expect(res.status).toBe(403);
  });

  it('учитель удаляет вопрос — пропадает из банка, includeDeleted его возвращает с deletedAt', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { itemId } = await publishedItemAndExam(teacherCookie);

    await withCsrf(request(server()).delete(`/api/exam-items/${itemId}`)).set(
      'Cookie',
      teacherCookie,
    );

    const plain = await request(server())
      .get('/api/exam-items')
      .set('Cookie', teacherCookie);
    expect((plain.body as ExamItemDto[]).some((i) => i.id === itemId)).toBe(false);

    const withDeleted = await request(server())
      .get('/api/exam-items')
      .query({ includeDeleted: true })
      .set('Cookie', teacherCookie);
    const deletedDto = (withDeleted.body as ExamItemDto[]).find((i) => i.id === itemId);
    expect(deletedDto?.deletedAt).toBeDefined();
  });
});
