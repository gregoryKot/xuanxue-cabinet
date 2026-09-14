// e2e на /exam-items — данные школы (ADR-0010): доступ по роли, не по
// владельцу (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer — те же гвард/пайпы/фильтры, что видит браузер.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { ApiErrorBody, ExamItemDto, UserRole } from '@xuanxue/shared';
import request from 'supertest';
import { ExamItemRecord } from '../src/exams/exam-item.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = { kind: 'text' as const, prompt: 'Опишите форму «пэнбу»' };

describe('Exam items (e2e)', () => {
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

  function postItem(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchItem(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/exam-items/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  // Сырой документ мимо сервиса — единственный способ увидеть, что реально
  // лежит в базе (без decryptRecord), для тестов на шифрование ниже.
  async function rawDoc(id: string): Promise<{ prompt?: string; options?: string }> {
    const model = testApp.app.get<Model<ExamItemRecord>>(
      getModelToken(ExamItemRecord.name),
      {
        strict: false,
      },
    );
    const doc = await model.collection.findOne<{ prompt?: string; options?: string }>({
      _id: new Types.ObjectId(id),
    });
    if (!doc) throw new Error('документ не найден в сырой Mongo');
    return doc;
  }

  it('GET /exam-items без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/exam-items');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('POST /exam-items без cookie, но с x-requested-with — 401 (не 403)', async () => {
    const res = await withCsrf(request(server()).post('/api/exam-items')).send(
      VALID_BODY,
    );
    expect(res.status).toBe(401);
  });

  it('POST /exam-items с cookie учителя, но без x-requested-with — 403 (CSRF раньше сессии)', async () => {
    const cookie = await sessionFor(['teacher']);
    const res = await request(server())
      .post('/api/exam-items')
      .set('Cookie', cookie)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('ученик: GET, POST, PATCH и DELETE /exam-items — 403', async () => {
    // Вопрос учителя — цель для PATCH/DELETE ниже: без своего ресурса роль
    // без teacher/admin не проверить (данные школы, ADR-0010 — по роли, а не
    // владельцу, поэтому здесь один общий вопрос, а не «чужой» и «свой»).
    const teacherCookie = await sessionFor(['teacher']);
    const created = await postItem(teacherCookie, VALID_BODY);
    const itemId = (created.body as ExamItemDto).id;

    const cookie = await sessionFor([]);

    const getRes = await request(server()).get('/api/exam-items').set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const getByIdRes = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', cookie);
    expect(getByIdRes.status).toBe(403);

    const postRes = await postItem(cookie, VALID_BODY);
    expect(postRes.status).toBe(403);

    const patchRes = await patchItem(cookie, itemId, { tags: ['своё'] });
    expect(patchRes.status).toBe(403);

    const deleteRes = await withCsrf(
      request(server()).delete(`/api/exam-items/${itemId}`),
    ).set('Cookie', cookie);
    expect(deleteRes.status).toBe(403);

    // Вопрос не пострадал — ни PATCH, ни DELETE не прошли по роли.
    const stillThere = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', teacherCookie);
    expect(stillThere.status).toBe(200);
    expect((stillThere.body as ExamItemDto).tags).toEqual([]);
  });

  describe('учитель', () => {
    it('CRUD целиком: create → get → patch → list → delete → 404', async () => {
      const cookie = await sessionFor(['teacher']);

      const created = await postItem(cookie, VALID_BODY);
      expect(created.status).toBe(201);
      const dto = created.body as ExamItemDto;
      expect(dto.prompt).toBe(VALID_BODY.prompt);
      expect(dto.status).toBe('draft');
      expect(dto.version).toBe(1);
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API»).
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const got = await request(server())
        .get(`/api/exam-items/${dto.id}`)
        .set('Cookie', cookie);
      expect(got.status).toBe(200);
      expect((got.body as ExamItemDto).id).toBe(dto.id);

      const patched = await patchItem(cookie, dto.id, { tags: ['теория'] });
      expect(patched.status).toBe(200);
      expect((patched.body as ExamItemDto).tags).toEqual(['теория']);

      const list = await request(server()).get('/api/exam-items').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as ExamItemDto[]).some((i) => i.id === dto.id)).toBe(true);

      const deleted = await withCsrf(
        request(server()).delete(`/api/exam-items/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const afterDelete = await request(server())
        .get(`/api/exam-items/${dto.id}`)
        .set('Cookie', cookie);
      expect(afterDelete.status).toBe(404);
    });

    it('POST с лишним полем authorId — 400 (forbidNonWhitelisted), не тихая потеря', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postItem(cookie, { ...VALID_BODY, authorId: 'x' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('authorId: поле не поддерживается.');
    });

    it('POST с prompt из одних пробелов — 400 (TrimString + IsNotEmpty)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postItem(cookie, { ...VALID_BODY, prompt: '   ' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('POST single с одним вариантом — 400 в конверте (сочетание kind+options, сервис)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postItem(cookie, {
        kind: 'single',
        prompt: 'Сколько форм в разделе?',
        options: [{ text: 'Один', correct: true }],
      });
      expect(res.status).toBe(400);
      const body = res.body as ApiErrorBody;
      expect(body.code).toBe('invalid_input');
      expect(body.message).toContain('от 2 до 10');
    });

    it('POST single с двумя вариантами и одним верным — 201, id у каждого варианта', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postItem(cookie, {
        kind: 'single',
        prompt: 'Сколько форм в разделе?',
        options: [
          { text: 'Пять', correct: false },
          { text: 'Восемь', correct: true },
        ],
      });
      expect(res.status).toBe(201);
      const dto = res.body as ExamItemDto;
      expect(dto.options).toHaveLength(2);
      expect(dto.options.every((o) => typeof o.id === 'string')).toBe(true);
    });

    it('PATCH { criteria: null } — 200, поля нет в ответе', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postItem(cookie, { ...VALID_BODY, criteria: 'критерий' });
      const dto = created.body as ExamItemDto;

      const patched = await patchItem(cookie, dto.id, { criteria: null });
      expect(patched.status).toBe(200);
      expect(patched.body as Record<string, unknown>).not.toHaveProperty('criteria');
    });

    it('PATCH { prompt: null } — 400 (prompt не входит в NULLABLE_EXAM_ITEM_FIELDS)', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postItem(cookie, VALID_BODY);
      const dto = created.body as ExamItemDto;

      const patched = await patchItem(cookie, dto.id, { prompt: null });
      expect(patched.status).toBe(400);
    });

    it('правка prompt у опубликованного вопроса — version 2, старая формулировка в history', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postItem(cookie, VALID_BODY);
      const dto = created.body as ExamItemDto;

      await patchItem(cookie, dto.id, { status: 'published' });
      const patched = await patchItem(cookie, dto.id, { prompt: 'Новая формулировка' });

      expect(patched.status).toBe(200);
      const updated = patched.body as ExamItemDto;
      expect(updated.version).toBe(2);
      expect(updated.history).toHaveLength(1);
      expect(updated.history[0]?.prompt).toBe(VALID_BODY.prompt);
    });

    it('DELETE опубликованного вопроса — 409, вопрос остаётся', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postItem(cookie, VALID_BODY);
      const dto = created.body as ExamItemDto;
      await patchItem(cookie, dto.id, { status: 'published' });

      const res = await withCsrf(
        request(server()).delete(`/api/exam-items/${dto.id}`),
      ).set('Cookie', cookie);
      expect(res.status).toBe(409);

      const stillThere = await request(server())
        .get(`/api/exam-items/${dto.id}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(200);
    });

    it('GET /exam-items?limit=1 при двух вопросах — 1 в ответе', async () => {
      const cookie = await sessionFor(['teacher']);
      await postItem(cookie, { ...VALID_BODY, prompt: 'Первый' });
      await postItem(cookie, { ...VALID_BODY, prompt: 'Второй' });

      const res = await request(server())
        .get('/api/exam-items')
        .query({ limit: 1 })
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect((res.body as ExamItemDto[]).length).toBe(1);
    });

    it('prompt и options зашифрованы в сырой Mongo — расшифровка только через сервис', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postItem(cookie, {
        kind: 'single',
        prompt: VALID_BODY.prompt,
        options: [
          { text: 'Пять', correct: false },
          { text: 'Восемь', correct: true },
        ],
      });
      const dto = created.body as ExamItemDto;

      const raw = await rawDoc(dto.id);
      expect(raw.prompt).toBeDefined();
      expect(raw.prompt).not.toBe(VALID_BODY.prompt);
      expect(raw.options).toBeDefined();
      expect(raw.options).not.toContain('Восемь');
      expect(raw.options).not.toContain('Пять');
      expect(raw.options).not.toContain('correct');
    });
  });

  it('админ: GET /exam-items — 200', async () => {
    const cookie = await sessionFor(['admin']);
    const res = await request(server()).get('/api/exam-items').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
