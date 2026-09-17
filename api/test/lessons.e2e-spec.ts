// e2e на /lessons — данные школы (ADR-0010): доступ по роли, не по владельцу
// (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer — те же гвард/пайпы/фильтры, что видит браузер. Статус
// рассылки на карточке — lessons-broadcast-status.e2e-spec.ts (тот же файл
// хелперов, чтобы спек уместился в лимит, CLAUDE.md «Храповики»).
import { Types } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, LessonDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  createLessonTestHelpers,
  FROM,
  STARTS_AT,
  TO,
} from './e2e-support/lessons-fixtures';

describe('Lessons (e2e)', () => {
  let testApp: TestApp;
  const {
    server,
    sessionFor,
    classModel,
    lessonModel,
    createClass,
    postLesson,
    patchLesson,
  } = createLessonTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  });

  it('GET /lessons без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/lessons').query({ from: FROM, to: TO });
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('POST /lessons: без сессии — 401 (не 403), с сессией без x-requested-with — 403', async () => {
    const classId = await createClass();
    const body = { classId, startsAt: STARTS_AT };

    const noSession = await withCsrf(request(server()).post('/api/lessons')).send(body);
    expect(noSession.status).toBe(401);

    const cookie = await sessionFor(['teacher']);
    const noCsrf = await request(server())
      .post('/api/lessons')
      .set('Cookie', cookie)
      .send(body);
    expect(noCsrf.status).toBe(403);
  });

  it('ученик: GET и POST /lessons — 403', async () => {
    const cookie = await sessionFor([]);
    const classId = await createClass();

    const getRes = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const postRes = await postLesson(cookie, { classId, startsAt: STARTS_AT });
    expect(postRes.status).toBe(403);
  });

  it('админ: GET /lessons — 200', async () => {
    const cookie = await sessionFor(['admin']);
    const res = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('учитель: GET /lessons без from/to — 400 в конверте, окно 5 недель — тоже 400', async () => {
    const cookie = await sessionFor(['teacher']);

    const noWindow = await request(server()).get('/api/lessons').set('Cookie', cookie);
    expect(noWindow.status).toBe(400);
    expect((noWindow.body as ApiErrorBody).code).toBe('invalid_input');

    const wideWindow = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: '2026-10-13T00:00:00Z' })
      .set('Cookie', cookie);
    expect(wideWindow.status).toBe(400);
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
    it('POST разового занятия → 201 без plannedAt и без документа Mongoose; GET видит его; без смещения зоны — 400', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass({ rulesDurationMin: 45 });

      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      expect(created.status).toBe(201);
      const dto = created.body as LessonDto;
      expect(dto.plannedAt).toBeUndefined();
      expect(dto.durationMin).toBe(45);
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API»).
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const list = await request(server())
        .get('/api/lessons')
        .query({ from: FROM, to: TO })
        .set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as LessonDto[]).some((l) => l.id === dto.id)).toBe(true);

      const noOffset = await postLesson(cookie, {
        classId,
        startsAt: '2026-09-03T16:00:00',
      });
      expect(noOffset.status).toBe(400);
    });

    it('PATCH темы и zoomLinkOverride → 200, ссылка зашифрована в Mongo; recordingPromptedAt скрыт', async () => {
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

      const raw = await lessonModel().collection.findOne<{ zoomLinkOverride?: string }>({
        _id: new Types.ObjectId(dto.id),
      });
      expect(raw?.zoomLinkOverride).toBeDefined();
      expect(raw?.zoomLinkOverride).not.toBe(link);

      // Служебная метка бота («Запись?» задаётся один раз) — планировщик
      // проставляет её напрямую через модель, наружу она не должна уйти.
      await lessonModel().updateOne(
        { _id: dto.id },
        { $set: { recordingPromptedAt: new Date() } },
      );
      const reread = await request(server())
        .get(`/api/lessons/${dto.id}`)
        .set('Cookie', cookie);
      expect(reread.body as Record<string, unknown>).not.toHaveProperty(
        'recordingPromptedAt',
      );
    });

    it('PATCH { topic: null } — 400, PATCH { note: null } — 200 и поле пропадает', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
      const dto = created.body as LessonDto;

      // topic не входит в NULLABLE_LESSON_FIELDS — null там ошибка формы.
      const topicPatched = await patchLesson(cookie, dto.id, { topic: null });
      expect(topicPatched.status).toBe(400);

      await patchLesson(cookie, dto.id, { note: 'Перенесли' });
      const notePatched = await patchLesson(cookie, dto.id, { note: null });
      expect(notePatched.status).toBe(200);
      expect(notePatched.body as Record<string, unknown>).not.toHaveProperty('note');
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

    it('DELETE даты из расписания — 409, дата остаётся; DELETE разовой — 204, затем 404', async () => {
      const cookie = await sessionFor(['teacher']);
      const classId = await createClass();
      const planned = await lessonModel().create({
        classId,
        plannedAt: new Date(STARTS_AT),
        startsAt: new Date(STARTS_AT),
        durationMin: 60,
      });

      const plannedRes = await withCsrf(
        request(server()).delete(`/api/lessons/${planned._id.toString()}`),
      ).set('Cookie', cookie);
      expect(plannedRes.status).toBe(409);
      const stillThere = await request(server())
        .get(`/api/lessons/${planned._id.toString()}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(200);

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
