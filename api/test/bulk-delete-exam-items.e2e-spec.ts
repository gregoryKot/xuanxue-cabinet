// e2e на POST /exam-items/bulk-delete (ADR-0141) — новый файл, не правка
// exam-items.e2e-spec.ts: тот уже у потолка файлового храповика
// (CLAUDE.md «Храповики»). Настоящий AppModule на MongoMemoryServer, как и
// остальные *.e2e-spec.ts — те же гвард/пайпы/фильтры, что видит браузер.
//
// Отказ по одному id здесь — только «не найден» (ADR-0140 разрешает
// одиночное удаление вопроса в любом статусе, включая используемый в
// экзамене, — «опубликован»/«используется» больше не повод для отказа).
// Партия из неизвестного ObjectId и «мусора» покрывает саму механику
// частичного успеха; per-record доменные отказы, которые остаются после
// ADR-0140, — предмет своего теста ExamItemsService, не этого файла.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type {
  ApiErrorBody,
  BulkDeleteResult,
  ExamItemDto,
  UserRole,
} from '@xuanxue/shared';
import request from 'supertest';
import { ExamItemRecord } from '../src/exams/exam-item.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const NOT_FOUND_MESSAGE = 'Вопрос не найден. Обновите список.';
// Валидный ObjectId, которого нет в базе, — отличается от «мусора» (не
// ObjectId вовсе): оба должны провалиться одним и тем же текстом отказа, но
// проверяют разные ветки assertObjectId.
const RANDOM_VALID_ID = '507f1f77bcf86cd799439011';
const GARBAGE_ID = 'не-объект-id';

describe('POST /exam-items/bulk-delete (e2e)', () => {
  let testApp: TestApp;
  let itemModel: Model<ExamItemRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    itemModel = testApp.app.get<Model<ExamItemRecord>>(
      getModelToken(ExamItemRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await itemModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function bulkDelete(cookie: string, ids: unknown): request.Test {
    return withCsrf(request(server()).post('/api/exam-items/bulk-delete'))
      .set('Cookie', cookie)
      .send({ ids });
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  // Черновик — единственный статус, который здесь и остаётся однозначно
  // «удалится»: default-статус создания — published (ADR-0033), поэтому
  // черновик просит его явно.
  async function createDraftItem(cookie: string, prompt: string): Promise<string> {
    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt, status: 'draft' });
    return (created.body as ExamItemDto).id;
  }

  it('без cookie — 401', async () => {
    const res = await withCsrf(
      request(server()).post('/api/exam-items/bulk-delete'),
    ).send({ ids: ['x'] });
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик — 403, ничего не удаляется', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const itemId = await createDraftItem(teacherCookie, 'вопрос');
    const studentCookie = await sessionFor([]);

    const res = await bulkDelete(studentCookie, [itemId]);
    expect(res.status).toBe(403);

    const stillThere = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', teacherCookie);
    expect(stillThere.status).toBe(200);
  });

  describe('учитель', () => {
    it('черновики удаляются, неизвестные id — в failed, список обновлён', async () => {
      const cookie = await sessionFor(['teacher']);
      const draft1 = await createDraftItem(cookie, 'первый черновик');
      const draft2 = await createDraftItem(cookie, 'второй черновик');

      const res = await bulkDelete(cookie, [draft1, draft2, RANDOM_VALID_ID, GARBAGE_ID]);

      expect(res.status).toBe(200);
      const body = res.body as BulkDeleteResult;
      expect(body.deletedIds).toEqual([draft1, draft2]);
      expect(body.failed).toEqual([
        { id: RANDOM_VALID_ID, message: NOT_FOUND_MESSAGE },
        { id: GARBAGE_ID, message: NOT_FOUND_MESSAGE },
      ]);

      // Read-after-write: удалённых в списке больше нет.
      const list = await request(server()).get('/api/exam-items').set('Cookie', cookie);
      const ids = (list.body as ExamItemDto[]).map((item) => item.id);
      expect(ids).not.toContain(draft1);
      expect(ids).not.toContain(draft2);
    });

    it('дубли id обрабатываются один раз', async () => {
      const cookie = await sessionFor(['teacher']);
      const draft = await createDraftItem(cookie, 'черновик');

      const res = await bulkDelete(cookie, [draft, draft, draft]);

      expect(res.status).toBe(200);
      expect((res.body as BulkDeleteResult).deletedIds).toEqual([draft]);

      const stillThere = await request(server())
        .get(`/api/exam-items/${draft}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(404);
    });

    it('{ ids: [] } — 400', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await bulkDelete(cookie, []);
      expect(res.status).toBe(400);
    });

    it('{ ids: "x" } — 400 (не массив)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await bulkDelete(cookie, 'x');
      expect(res.status).toBe(400);
    });

    it('201 id в списке — 400 (потолок BULK_DELETE_MAX_IDS)', async () => {
      const cookie = await sessionFor(['teacher']);
      const tooMany = Array.from({ length: 201 }, (_, i) => `id-${i}`);
      const res = await bulkDelete(cookie, tooMany);
      expect(res.status).toBe(400);
    });

    it('лишнее поле в теле — 400 (forbidNonWhitelisted)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await withCsrf(request(server()).post('/api/exam-items/bulk-delete'))
        .set('Cookie', cookie)
        .send({ ids: ['x'], extra: 1 });
      expect(res.status).toBe(400);
    });
  });
});
