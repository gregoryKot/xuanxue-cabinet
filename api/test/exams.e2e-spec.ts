// e2e на /exams — данные школы (ADR-0010): доступ по роли, не по владельцу
// (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer — те же гвард/пайпы/фильтры, что видит браузер.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { ApiErrorBody, ExamDto, UserRole } from '@xuanxue/shared';
import request from 'supertest';
import { ExamItemRecord } from '../src/exams/exam-item.schema';
import { ExamRecord } from '../src/exams/exam.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = { title: 'Экзамен по третьей форме' };

describe('Exams (e2e)', () => {
  let testApp: TestApp;
  let examModel: Model<ExamRecord>;
  let itemModel: Model<ExamItemRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    examModel = testApp.app.get<Model<ExamRecord>>(getModelToken(ExamRecord.name), {
      strict: false,
    });
    itemModel = testApp.app.get<Model<ExamItemRecord>>(
      getModelToken(ExamItemRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await examModel.deleteMany({});
    await itemModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function postExam(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchExam(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/exams/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  // Опубликованный вопрос банка — цель для блоков ниже, напрямую через
  // модель (тот же приём, что createChannel в broadcasts.e2e-spec.ts): здесь
  // не тестируется сам банк вопросов, у него свой exam-items.e2e-spec.ts.
  async function createPublishedItem(): Promise<string> {
    const doc = await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      status: 'published',
    });
    return doc._id.toString();
  }

  // Сырой документ мимо сервиса — единственный способ увидеть, что реально
  // лежит в базе (без decryptRecord).
  async function rawDoc(id: string): Promise<{ title?: string }> {
    const doc = await examModel.collection.findOne<{ title?: string }>({
      _id: new Types.ObjectId(id),
    });
    if (!doc) throw new Error('документ не найден в сырой Mongo');
    return doc;
  }

  it('GET /exams без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/exams');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it.each([
    ['ученик', ['student'] as UserRole[]],
    ['гость', [] as UserRole[]],
  ])('%s: GET, POST, PATCH и DELETE /exams — 403', async (_label, roles) => {
    // Форма учителя — цель для PATCH/DELETE ниже: без своего ресурса роль
    // без teacher/admin не проверить (данные школы, ADR-0010 — по роли, а не
    // владельцу, поэтому здесь один общий экзамен, а не «чужой» и «свой»).
    const teacherCookie = await sessionFor(['teacher']);
    const created = await postExam(teacherCookie, VALID_BODY);
    const examId = (created.body as ExamDto).id;

    const cookie = await sessionFor(roles);

    const getRes = await request(server()).get('/api/exams').set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const getByIdRes = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', cookie);
    expect(getByIdRes.status).toBe(403);

    const postRes = await postExam(cookie, VALID_BODY);
    expect(postRes.status).toBe(403);

    const patchRes = await patchExam(cookie, examId, { level: 'своё' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await withCsrf(
      request(server()).delete(`/api/exams/${examId}`),
    ).set('Cookie', cookie);
    expect(deleteRes.status).toBe(403);

    // Форма не пострадала — ни PATCH, ни DELETE не прошли по роли.
    const stillThere = await request(server())
      .get(`/api/exams/${examId}`)
      .set('Cookie', teacherCookie);
    expect(stillThere.status).toBe(200);
    expect((stillThere.body as ExamDto).level).toBe('');
  });

  describe('учитель', () => {
    it('CRUD целиком: create → get → patch → list → delete → 404', async () => {
      const cookie = await sessionFor(['teacher']);

      const created = await postExam(cookie, VALID_BODY);
      expect(created.status).toBe(201);
      const dto = created.body as ExamDto;
      expect(dto.title).toBe(VALID_BODY.title);
      expect(dto.status).toBe('draft');
      expect(dto.attemptsAllowed).toBe(1);
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API»).
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const got = await request(server())
        .get(`/api/exams/${dto.id}`)
        .set('Cookie', cookie);
      expect(got.status).toBe(200);
      expect((got.body as ExamDto).id).toBe(dto.id);

      const patched = await patchExam(cookie, dto.id, { level: 'начальный' });
      expect(patched.status).toBe(200);
      expect((patched.body as ExamDto).level).toBe('начальный');

      // title не входит в NULLABLE_EXAM_FIELDS (shared/src/exams.ts) — 400.
      const patchedNullTitle = await patchExam(cookie, dto.id, { title: null });
      expect(patchedNullTitle.status).toBe(400);

      const list = await request(server()).get('/api/exams').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as ExamDto[]).some((exam) => exam.id === dto.id)).toBe(true);

      // «Дай всё» запрещён (CLAUDE.md «API») — второй экзамен и limit=1 в
      // одном списке, вместо отдельного теста только на лимит.
      await postExam(cookie, { title: 'Второй экзамен' });
      const limited = await request(server())
        .get('/api/exams')
        .query({ limit: 1 })
        .set('Cookie', cookie);
      expect((limited.body as ExamDto[]).length).toBe(1);

      const deleted = await withCsrf(
        request(server()).delete(`/api/exams/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const afterDelete = await request(server())
        .get(`/api/exams/${dto.id}`)
        .set('Cookie', cookie);
      expect(afterDelete.status).toBe(404);
    });

    it('POST с лишним полем passingScore — 400 (forbidNonWhitelisted, проходного балла нет)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postExam(cookie, { ...VALID_BODY, passingScore: 60 });
      expect(res.status).toBe(400);
      expect(res.text).toContain('passingScore: поле не поддерживается.');
    });

    it('POST с title из одних пробелов — 400 (TrimString + IsNotEmpty)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postExam(cookie, { title: '   ' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('POST с блоком на черновой вопрос — 400 в конверте, форма не создаётся', async () => {
      const cookie = await sessionFor(['teacher']);
      const draftItem = await itemModel.create({
        kind: 'text',
        prompt: 'x',
        status: 'draft',
      });

      const res = await postExam(cookie, {
        ...VALID_BODY,
        blocks: [{ itemIds: [draftItem._id.toString()] }],
      });

      expect(res.status).toBe(400);
      const body = res.body as ApiErrorBody;
      expect(body.code).toBe('invalid_input');
      expect(body.message).toContain('не из опубликованного банка');
      await expect(examModel.countDocuments({})).resolves.toBe(0);
    });

    it('POST с одним вопросом в двух блоках — 400 (повтор по всей форме)', async () => {
      const cookie = await sessionFor(['teacher']);
      const itemId = await createPublishedItem();

      const res = await postExam(cookie, {
        ...VALID_BODY,
        blocks: [{ itemIds: [itemId] }, { itemIds: [itemId] }],
      });

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toContain('повторяется');
    });

    it('PATCH { level: null } — 200, поля нет в ответе (сброс, пустая строка)', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postExam(cookie, { ...VALID_BODY, level: 'начальный' });
      const dto = created.body as ExamDto;

      const patched = await patchExam(cookie, dto.id, { level: null });
      expect(patched.status).toBe(200);
      expect((patched.body as ExamDto).level).toBe('');
    });

    it('публикация пустой формы — 400, статус не меняется', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postExam(cookie, VALID_BODY);
      const dto = created.body as ExamDto;

      const res = await patchExam(cookie, dto.id, { status: 'published' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toContain('нет ни одного вопроса');

      const stillDraft = await request(server())
        .get(`/api/exams/${dto.id}`)
        .set('Cookie', cookie);
      expect((stillDraft.body as ExamDto).status).toBe('draft');
    });

    it('публикация формы с блоком на опубликованный вопрос — 200, удалить уже нельзя', async () => {
      const cookie = await sessionFor(['teacher']);
      const itemId = await createPublishedItem();
      const created = await postExam(cookie, {
        ...VALID_BODY,
        blocks: [{ title: 'Форма', itemIds: [itemId] }],
      });
      const dto = created.body as ExamDto;
      expect(dto.blocks).toHaveLength(1);
      expect(typeof dto.blocks[0]?.id).toBe('string');

      const published = await patchExam(cookie, dto.id, { status: 'published' });
      expect(published.status).toBe(200);
      expect((published.body as ExamDto).status).toBe('published');

      // ТЗ 4.3, п.5: удалить можно только черновик — форма остаётся.
      const deleteRes = await withCsrf(
        request(server()).delete(`/api/exams/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleteRes.status).toBe(409);
      const stillThere = await request(server())
        .get(`/api/exams/${dto.id}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(200);
    });

    it('title зашифрован в сырой Mongo — расшифровка только через сервис', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postExam(cookie, VALID_BODY);
      const dto = created.body as ExamDto;

      const raw = await rawDoc(dto.id);
      expect(raw.title).toBeDefined();
      expect(raw.title).not.toBe(VALID_BODY.title);
    });
  });

  it('админ: GET /exams — 200', async () => {
    const cookie = await sessionFor(['admin']);
    const res = await request(server()).get('/api/exams').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
