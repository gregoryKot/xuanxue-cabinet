// e2e на /lessons — данные школы (ADR-0010): доступ по роли, не по владельцу
// (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer — те же гвард/пайпы/фильтры, что видит браузер.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, LessonDto, UserRole } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';

const FROM = '2026-09-01T00:00:00Z';
const TO = '2026-09-08T00:00:00Z';
const STARTS_AT = '2026-09-03T16:00:00Z';

describe('Lessons (e2e)', () => {
  let testApp: TestApp;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    classModel = testApp.app.get<Model<ClassRecord>>(getModelToken(ClassRecord.name), {
      strict: false,
    });
    lessonModel = testApp.app.get<Model<LessonRecord>>(getModelToken(LessonRecord.name), {
      strict: false,
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await lessonModel.deleteMany({});
    await classModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function withCsrf(req: request.Test): request.Test {
    return req.set('x-requested-with', 'fetch');
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, { name: 'Тест', roles });
    return cookie;
  }

  async function createClass(rulesDurationMin = 45): Promise<string> {
    const cls = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      rules: [{ weekday: 4, time: '19:00', durationMin: rulesDurationMin }],
    });
    return cls._id.toString();
  }

  function postLesson(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/lessons'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchLesson(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/lessons/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  it('GET /lessons без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/lessons').query({ from: FROM, to: TO });
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик: GET /lessons — 403', async () => {
    const cookie = await sessionFor(['student']);
    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('учитель: GET /lessons без from/to — 400 в конверте', async () => {
    const cookie = await sessionFor(['teacher']);
    const res = await request(server()).get('/api/lessons').set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('учитель: GET /lessons окно 5 недель — 400', async () => {
    const cookie = await sessionFor(['teacher']);
    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: '2026-10-13T00:00:00Z' })
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('учитель: GET /lessons?limit=1 при двух датах — 1 в ответе', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createClass();
    await postLesson(cookie, { classId, startsAt: STARTS_AT });
    await postLesson(cookie, { classId, startsAt: '2026-09-04T16:00:00Z' });

    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO, limit: 1 })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect((res.body as LessonDto[]).length).toBe(1);
  });

  describe('учитель', () => {
    it('POST разового занятия → 201 без plannedAt, длительность из правила класса; GET видит его', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass(45);

      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      expect(created.status).toBe(201);
      const dto = created.body as LessonDto;
      expect(dto.plannedAt).toBeUndefined();
      expect(dto.durationMin).toBe(45);

      const list = await request(server())
        .get('/api/lessons')
        .query({ from: FROM, to: TO })
        .set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as LessonDto[]).some((l) => l.id === dto.id)).toBe(true);
    });

    it('PATCH темы и zoomLinkOverride → 200, ссылка зашифрована в сырой Mongo', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      const dto = created.body as LessonDto;
      const link = 'https://us02web.zoom.us/j/999';

      const patched = await patchLesson(cookie, dto.id, {
        topic: 'Пятое занятие цикла',
        zoomLinkOverride: link,
      });
      expect(patched.status).toBe(200);
      expect((patched.body as LessonDto).topic).toBe('Пятое занятие цикла');
      expect((patched.body as LessonDto).zoomLinkOverride).toBe(link);

      const raw = await lessonModel.collection.findOne<{ zoomLinkOverride?: string }>({
        _id: new Types.ObjectId(dto.id),
      });
      expect(raw?.zoomLinkOverride).toBeDefined();
      expect(raw?.zoomLinkOverride).not.toBe(link);
    });

    it('PATCH { topic: null } — 400 (topic не входит в NULLABLE_LESSON_FIELDS)', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      const dto = created.body as LessonDto;

      const patched = await patchLesson(cookie, dto.id, { topic: null });
      expect(patched.status).toBe(400);
    });

    it('PATCH { note: null } — 200, поля нет в ответе', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      const dto = created.body as LessonDto;
      await patchLesson(cookie, dto.id, { note: 'Перенесли' });

      const patched = await patchLesson(cookie, dto.id, { note: null });
      expect(patched.status).toBe(200);
      expect(patched.body as Record<string, unknown>).not.toHaveProperty('note');
    });

    it('POST /lessons/:id/recording с url → 201, title из названия класса; без url/file_id — 400', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      const dto = created.body as LessonDto;

      const withUrl = await withCsrf(
        request(server()).post(`/api/lessons/${dto.id}/recording`),
      )
        .set('Cookie', cookie)
        .send({ url: 'https://drive.example/rec' });
      expect(withUrl.status).toBe(201);
      const withUrlDto = withUrl.body as LessonDto;
      expect(withUrlDto.recordings[0]?.title).toBe('Тайцзицюань');

      const withoutSource = await withCsrf(
        request(server()).post(`/api/lessons/${dto.id}/recording`),
      )
        .set('Cookie', cookie)
        .send({});
      expect(withoutSource.status).toBe(400);
    });

    it('DELETE даты из расписания (plannedAt есть) — 409, дата остаётся', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const planned = await lessonModel.create({
        classId,
        plannedAt: new Date(STARTS_AT),
        startsAt: new Date(STARTS_AT),
        durationMin: 60,
      });

      const res = await withCsrf(
        request(server()).delete(`/api/lessons/${planned._id.toString()}`),
      ).set('Cookie', cookie);
      expect(res.status).toBe(409);

      const stillThere = await request(server())
        .get(`/api/lessons/${planned._id.toString()}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(200);
    });

    it('DELETE разовой даты — 204, затем GET — 404', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      const dto = created.body as LessonDto;

      const deleted = await withCsrf(
        request(server()).delete(`/api/lessons/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const afterDelete = await request(server())
        .get(`/api/lessons/${dto.id}`)
        .set('Cookie', cookie);
      expect(afterDelete.status).toBe(404);
    });

    it('несуществующий и мусорный id — 404', async () => {
      const cookie = await sessionFor(['teacher']);

      const missing = await request(server())
        .get(`/api/lessons/${new Types.ObjectId().toString()}`)
        .set('Cookie', cookie);
      expect(missing.status).toBe(404);

      const garbage = await request(server())
        .get('/api/lessons/not-an-id')
        .set('Cookie', cookie);
      expect(garbage.status).toBe(404);
    });
  });
});
