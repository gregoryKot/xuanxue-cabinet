// e2e на /classes — данные школы (ADR-0010): доступ по роли, не по владельцу
// (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer — те же гвард/пайпы/фильтры, что видит браузер.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ClassDto, UserRole } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { telegramBody } from './e2e-support/channels-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const ZOOM_LINK = 'https://us02web.zoom.us/j/123';
const VALID_BODY = {
  title: 'Тайцзицюань',
  format: 'online' as const,
  zoomLink: ZOOM_LINK,
};

describe('Classes (e2e)', () => {
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

  function postClass(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchClass(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/classes/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  function postChannel(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/channels'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  it('GET /classes без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/classes');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('POST /classes без cookie, но с x-requested-with — 401 (не 403)', async () => {
    const res = await withCsrf(request(server()).post('/api/classes')).send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('POST /classes с cookie учителя, но без x-requested-with — 403 (CSRF раньше сессии)', async () => {
    const cookie = await sessionFor(['teacher']);
    const res = await request(server())
      .post('/api/classes')
      .set('Cookie', cookie)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('ученик: GET и POST /classes — 403', async () => {
    const cookie = await sessionFor([]);

    const getRes = await request(server()).get('/api/classes').set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const postRes = await postClass(cookie, VALID_BODY);
    expect(postRes.status).toBe(403);
  });

  describe('учитель', () => {
    it('CRUD целиком: create → get → patch → list → delete → 404', async () => {
      const cookie = await sessionFor(['teacher']);

      const created = await postClass(cookie, VALID_BODY);
      expect(created.status).toBe(201);
      const dto = created.body as ClassDto;
      expect(dto.zoomLink).toBe(ZOOM_LINK);
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API») —
      // ответ идёт только через toClassDto, `_id`/`__v` там нет.
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const got = await request(server())
        .get(`/api/classes/${dto.id}`)
        .set('Cookie', cookie);
      expect(got.status).toBe(200);
      expect((got.body as ClassDto).id).toBe(dto.id);

      const patched = await withCsrf(request(server()).patch(`/api/classes/${dto.id}`))
        .set('Cookie', cookie)
        .send({ groupLabel: 'средняя группа' });
      expect(patched.status).toBe(200);
      expect((patched.body as ClassDto).groupLabel).toBe('средняя группа');

      const list = await request(server()).get('/api/classes').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as ClassDto[]).some((c) => c.id === dto.id)).toBe(true);

      const deleted = await withCsrf(
        request(server()).delete(`/api/classes/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const afterDelete = await request(server())
        .get(`/api/classes/${dto.id}`)
        .set('Cookie', cookie);
      expect(afterDelete.status).toBe(404);
    });

    it('POST с лишним полем teacherId — 400 (forbidNonWhitelisted), не тихая потеря', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postClass(cookie, { ...VALID_BODY, teacherId: 'x' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('teacherId: поле не поддерживается.');
    });

    it('POST с zoomLink не по https — 400 в конверте с details', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postClass(cookie, {
        ...VALID_BODY,
        zoomLink: 'http://us02web.zoom.us/j/123',
      });
      expect(res.status).toBe(400);
      const body = res.body as ApiErrorBody;
      expect(body.code).toBe('invalid_input');
      expect(body.details?.length).toBeGreaterThan(0);
    });

    it('POST с title из одних пробелов — 400 (TrimString + IsNotEmpty)', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postClass(cookie, { ...VALID_BODY, title: '   ' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('POST с двумя правилами с одним id — 400 (ArrayUnique)', async () => {
      const cookie = await sessionFor(['teacher']);
      const ruleId = new Types.ObjectId().toString();
      const res = await postClass(cookie, {
        ...VALID_BODY,
        rules: [
          { id: ruleId, weekday: 1, time: '19:00', durationMin: 60 },
          { id: ruleId, weekday: 2, time: '10:00', durationMin: 30 },
        ],
      });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('PATCH { channelIds: null } — 400, список занятий по-прежнему доступен', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postClass(cookie, VALID_BODY);
      const dto = created.body as ClassDto;

      const patched = await patchClass(cookie, dto.id, { channelIds: null });
      expect(patched.status).toBe(400);

      const list = await request(server()).get('/api/classes').set('Cookie', cookie);
      expect(list.status).toBe(200);
    });

    it('PATCH { tz: null } — 400 (tz не входит в NULLABLE_CLASS_FIELDS)', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postClass(cookie, VALID_BODY);
      const dto = created.body as ClassDto;

      const patched = await patchClass(cookie, dto.id, { tz: null });
      expect(patched.status).toBe(400);
    });

    it('PATCH { zoomPassword: null } — 200, поля нет в ответе', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postClass(cookie, { ...VALID_BODY, zoomPassword: '1111' });
      const dto = created.body as ClassDto;

      const patched = await patchClass(cookie, dto.id, { zoomPassword: null });
      expect(patched.status).toBe(200);
      expect(patched.body as Record<string, unknown>).not.toHaveProperty('zoomPassword');
    });

    it('zoomLink зашифрован в сырой Mongo — расшифровка идёт только через сервис', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postClass(cookie, VALID_BODY);
      const dto = created.body as ClassDto;

      const model = testApp.app.get<Model<ClassRecord>>(getModelToken(ClassRecord.name), {
        strict: false,
      });
      const raw = await model.collection.findOne<{ zoomLink?: string }>({
        _id: new Types.ObjectId(dto.id),
      });
      expect(raw?.zoomLink).toBeDefined();
      expect(raw?.zoomLink).not.toBe(ZOOM_LINK);
    });

    it('GET /classes?limit=2 при трёх занятиях — 2 в ответе', async () => {
      const cookie = await sessionFor(['teacher']);
      await postClass(cookie, { ...VALID_BODY, title: 'Первое' });
      await postClass(cookie, { ...VALID_BODY, title: 'Второе' });
      await postClass(cookie, { ...VALID_BODY, title: 'Третье' });

      const res = await request(server())
        .get('/api/classes')
        .query({ limit: 2 })
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect((res.body as ClassDto[]).length).toBe(2);
    });

    it('POST /classes без channelIds при существующем Telegram-канале — канал в ответе (фикс «занятие без каналов»)', async () => {
      const cookie = await sessionFor(['teacher']);
      const channel = await postChannel(cookie, telegramBody());
      expect(channel.status).toBe(201);

      const res = await postClass(cookie, VALID_BODY);

      expect(res.status).toBe(201);
      expect((res.body as ClassDto).channelIds).toContain(
        (channel.body as { id: string }).id,
      );
    });

    it('DELETE занятия с датой в расписании — 409, занятие остаётся', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postClass(cookie, VALID_BODY);
      const dto = created.body as ClassDto;

      const lessonModel = testApp.app.get<Model<LessonRecord>>(
        getModelToken(LessonRecord.name),
        { strict: false },
      );
      await lessonModel.create({
        classId: dto.id,
        startsAt: new Date(),
        durationMin: 60,
      });

      const res = await withCsrf(request(server()).delete(`/api/classes/${dto.id}`)).set(
        'Cookie',
        cookie,
      );
      expect(res.status).toBe(409);

      const stillThere = await request(server())
        .get(`/api/classes/${dto.id}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(200);
    });
  });

  it('админ: GET /classes — 200', async () => {
    const cookie = await sessionFor(['admin']);
    const res = await request(server()).get('/api/classes').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
