// e2e на POST /exams/bulk-delete (ADR-0141) — новый файл, не правка
// exams.e2e-spec.ts: тот уже у потолка файлового храповика (CLAUDE.md
// «Храповики»). Настоящий AppModule на MongoMemoryServer, как и остальные
// *.e2e-spec.ts — те же гвард/пайпы/фильтры, что видит браузер.
//
// Отказ по одному id здесь — только «не найден» (ADR-0140 разрешает
// одиночное удаление формы в любом статусе — «опубликована»/«есть попытки»
// больше не повод для отказа). Партия из неизвестного ObjectId покрывает
// саму механику частичного успеха; per-record доменные отказы, которые
// остаются после ADR-0140, — предмет своего теста ExamsService, не этого файла.
import type { ApiErrorBody, BulkDeleteResult, ExamDto, UserRole } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const NOT_FOUND_MESSAGE = 'Экзамен не найден. Обновите список.';
const RANDOM_VALID_ID = '507f1f77bcf86cd799439011';

describe('POST /exams/bulk-delete (e2e)', () => {
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

  function bulkDelete(cookie: string, ids: unknown): request.Test {
    return withCsrf(request(server()).post('/api/exams/bulk-delete'))
      .set('Cookie', cookie)
      .send({ ids });
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  function postExam(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send(body);
  }

  it('без cookie — 401', async () => {
    const res = await withCsrf(request(server()).post('/api/exams/bulk-delete')).send({
      ids: ['x'],
    });
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик — 403, ничего не удаляется', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const created = await postExam(teacherCookie, { title: 'Экзамен' });
    const examId = (created.body as ExamDto).id;
    const studentCookie = await sessionFor([]);

    const res = await bulkDelete(studentCookie, [examId]);
    expect(res.status).toBe(403);

    const stillThere = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect(stillThere.status).toBe(200);
  });

  describe('учитель', () => {
    it('черновики удаляются, неизвестный id — в failed, список обновлён', async () => {
      const cookie = await sessionFor(['teacher']);
      const draft1 = await postExam(cookie, { title: 'Первый черновик' });
      const draftId1 = (draft1.body as ExamDto).id;
      const draft2 = await postExam(cookie, { title: 'Второй черновик' });
      const draftId2 = (draft2.body as ExamDto).id;

      const res = await bulkDelete(cookie, [draftId1, draftId2, RANDOM_VALID_ID]);

      expect(res.status).toBe(200);
      const body = res.body as BulkDeleteResult;
      expect(body.deletedIds).toEqual([draftId1, draftId2]);
      expect(body.failed).toEqual([{ id: RANDOM_VALID_ID, message: NOT_FOUND_MESSAGE }]);

      // Read-after-write: удалённых в списке больше нет.
      const list = await request(server()).get('/api/exams').set('Cookie', cookie);
      const ids = (list.body as ExamDto[]).map((exam) => exam.id);
      expect(ids).not.toContain(draftId1);
      expect(ids).not.toContain(draftId2);
    });

    it('дубли id обрабатываются один раз', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postExam(cookie, { title: 'Черновик' });
      const examId = (created.body as ExamDto).id;

      const res = await bulkDelete(cookie, [examId, examId]);

      expect(res.status).toBe(200);
      expect((res.body as BulkDeleteResult).deletedIds).toEqual([examId]);

      const stillThere = await request(server())
        .get(`/api/exams/${examId}`)
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
      const res = await withCsrf(request(server()).post('/api/exams/bulk-delete'))
        .set('Cookie', cookie)
        .send({ ids: ['x'], extra: 1 });
      expect(res.status).toBe(400);
    });
  });
});
