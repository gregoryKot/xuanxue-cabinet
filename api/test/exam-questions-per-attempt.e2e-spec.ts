// ADR-0082: «Вопросов ученику» у блока формы — через настоящие точки входа
// (CLAUDE.md «Тесты», read-after-write: сохранили в POST /exams — увидели в
// GET /exams/:id). Отдельный файл, а не рост exams.e2e-spec.ts: тот уже
// сверх мягкого предела храповика размера.
import type { ApiErrorBody, ExamDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Экзамен: вопросов ученику в попытке (e2e)', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    cookie = await sessionCookieFor(testApp.app, ['teacher']);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  // Вопрос заводится как в браузере — сразу опубликованным (ADR-0033).
  async function createItem(): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Опишите стойку «мабу»' });
    expect(res.status).toBe(201);
    return (res.body as ExamItemDto).id;
  }

  function postExam(questionsPerAttempt: number, itemIds: string[]): request.Test {
    return withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({ title: 'Форма 1', blocks: [{ itemIds, questionsPerAttempt }] });
  }

  it('сохранили число → оно в ответе POST и в GET /exams/:id', async () => {
    const itemIds = [await createItem(), await createItem()];

    const created = await postExam(1, itemIds);
    expect(created.status).toBe(201);
    expect((created.body as ExamDto).blocks[0]?.questionsPerAttempt).toBe(1);

    const read = await request(server())
      .get(`/api/exams/${(created.body as ExamDto).id}`)
      .set('Cookie', cookie);
    expect(read.status).toBe(200);
    expect((read.body as ExamDto).blocks[0]?.questionsPerAttempt).toBe(1);
  });

  it('число больше списка — 400 с текстом, что делать', async () => {
    const res = await postExam(2, [await createItem()]);

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(
      'В списке 1 вопрос, а ученику вы хотите показать 2. Уменьшите число или добавьте вопросы.',
    );
  });

  it('ноль — 400: минимум один вопрос', async () => {
    const res = await postExam(0, [await createItem()]);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  // ADR-0082, дополнение: обязательные вопросы.
  describe('requiredItemIds', () => {
    it('сохранили — оно в ответе POST и в GET /exams/:id', async () => {
      const itemIds = [await createItem(), await createItem()];
      const created = await withCsrf(request(server()).post('/api/exams'))
        .set('Cookie', cookie)
        .send({
          title: 'Форма 1',
          blocks: [{ itemIds, questionsPerAttempt: 1, requiredItemIds: [itemIds[0]] }],
        });

      expect(created.status).toBe(201);
      expect((created.body as ExamDto).blocks[0]?.requiredItemIds).toEqual([itemIds[0]]);

      const read = await request(server())
        .get(`/api/exams/${(created.body as ExamDto).id}`)
        .set('Cookie', cookie);
      expect(read.status).toBe(200);
      expect((read.body as ExamDto).blocks[0]?.requiredItemIds).toEqual([itemIds[0]]);
    });

    it('id вне itemIds — отброшен в ответе (mapBlocks, exam-blocks.ts)', async () => {
      const [keptId, otherItemId] = [await createItem(), await createItem()];
      const created = await withCsrf(request(server()).post('/api/exams'))
        .set('Cookie', cookie)
        .send({
          title: 'Форма 1',
          blocks: [
            {
              itemIds: [keptId],
              questionsPerAttempt: 1,
              requiredItemIds: [keptId, otherItemId],
            },
          ],
        });

      expect(created.status).toBe(201);
      expect((created.body as ExamDto).blocks[0]?.requiredItemIds).toEqual([keptId]);
    });

    it('обязательных больше, чем «Вопросов ученику» — 400 с текстом, что делать', async () => {
      const itemIds = [await createItem(), await createItem()];
      const res = await withCsrf(request(server()).post('/api/exams'))
        .set('Cookie', cookie)
        .send({
          title: 'Форма 1',
          blocks: [{ itemIds, questionsPerAttempt: 1, requiredItemIds: itemIds }],
        });

      expect(res.status).toBe(400);
      const body = res.body as ApiErrorBody;
      expect(body.code).toBe('invalid_input');
      expect(body.message).toBe(
        'Обязательных вопросов 2, а ученику вы показываете 1. ' +
          'Уменьшите число обязательных или увеличьте «Вопросов ученику».',
      );
    });
  });
});
