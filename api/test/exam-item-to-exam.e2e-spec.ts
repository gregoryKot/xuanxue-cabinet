// Read-after-write через настоящие точки входа (CLAUDE.md «Тесты»: «пишем в
// одном месте, показываем в другом» — обязателен при нескольких точках
// входа). «Вопросы» (exam-items.e2e-spec.ts) и конструктор экзамена
// (exams.e2e-spec.ts) читают тот же банк вопросов по-разному — там вопрос
// заводится напрямую через модель (`createPublishedItem`, в обход сервиса и
// шифрования), здесь — обычными POST+PATCH /exam-items, как в браузере.
// Баг с прода: учитель публикует вопрос на «Вопросах», в конструкторе
// экзамена его не видно/не выбрать.
import type { ApiErrorBody, ExamDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Вопрос из банка → конструктор экзамена (e2e)', () => {
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

  it('создан и опубликован на «Вопросах» → виден в GET /exam-items и попадает в блок формы', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    // Экран «Вопросы» (ТЗ 4.2): учитель заводит вопрос — по умолчанию черновик.
    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Опишите стойку «мабу»' });
    expect(created.status).toBe(201);
    const itemId = (created.body as ExamItemDto).id;

    // И публикует его той же кнопкой «Опубликовать».
    const published = await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', cookie)
      .send({ status: 'published' });
    expect(published.status).toBe(200);
    expect((published.body as ExamItemDto).status).toBe('published');

    // Конструктор экзамена грузит банк без фильтра (ExamSheet.tsx,
    // useExamItems(BANK_FILTERS)) — вопрос обязан найтись.
    const bank = await request(server())
      .get('/api/exam-items')
      .query({ limit: 200 })
      .set('Cookie', cookie);
    expect(bank.status).toBe(200);
    expect((bank.body as ExamItemDto[]).some((i) => i.id === itemId)).toBe(true);

    // И его можно поставить в блок формы — сервер принимает как «из
    // опубликованного банка» (assertItemsEligible, exam-items-eligible.ts).
    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({
        title: 'Экзамен по третьей форме',
        blocks: [{ title: 'Блок', itemIds: [itemId] }],
      });
    expect(exam.status).toBe(201);
    expect((exam.body as ExamDto).blocks[0]?.itemIds).toEqual([itemId]);
  });

  // Блокер аудита 2026-09-15 №2 (архивация) и его снятое по ADR-0140
  // удаление ниже — реальный HTTP-путь учителя, не вызов сервиса напрямую.
  async function createItemInExam(
    server: () => ReturnType<TestApp['app']['getHttpServer']>,
    cookie: string,
  ): Promise<{ itemId: string; examTitle: string }> {
    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Опишите стойку «гунбу»' });
    const itemId = (created.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', cookie)
      .send({ status: 'published' });

    const examTitle = 'Экзамен по стойкам';
    await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({ title: examTitle, blocks: [{ itemIds: [itemId] }] });

    return { itemId, examTitle };
  }

  it('DELETE вопроса, стоящего в форме, — 204: пропадает из банка, форма его не теряет (ADR-0140)', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { itemId, examTitle } = await createItemInExam(server, cookie);

    const res = await withCsrf(request(server()).delete(`/api/exam-items/${itemId}`)).set(
      'Cookie',
      cookie,
    );
    expect(res.status).toBe(204);

    const gone = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', cookie);
    expect(gone.status).toBe(404);

    // includeDeleted — редактор формы всё ещё видит формулировку.
    const withDeleted = await request(server())
      .get('/api/exam-items')
      .query({ includeDeleted: true })
      .set('Cookie', cookie);
    const deletedDto = (withDeleted.body as ExamItemDto[]).find((i) => i.id === itemId);
    expect(deletedDto?.deletedAt).toBeDefined();

    // Форма продолжает ссылаться на удалённый вопрос — учитель её не терял.
    const examList = await request(server()).get('/api/exams').set('Cookie', cookie);
    const exam = (examList.body as ExamDto[]).find((e) => e.title === examTitle);
    expect(exam?.blocks[0]?.itemIds).toEqual([itemId]);
  });

  it('архивация вопроса, стоящего в форме, — 409 с названием формы, статус не меняется', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { itemId, examTitle } = await createItemInExam(server, cookie);

    const res = await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', cookie)
      .send({ status: 'archived' });

    expect(res.status).toBe(409);
    expect((res.body as ApiErrorBody).message).toContain(`«${examTitle}»`);

    const stillThere = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', cookie);
    expect((stillThere.body as ExamItemDto).status).toBe('published');
  });
});
