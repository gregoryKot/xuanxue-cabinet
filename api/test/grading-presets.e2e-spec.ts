// e2e на /grading-presets — данные школы (ADR-0010, ADR-0041): доступ по
// роли, не по владельцу (e2e-support/README.md, «данные школы»). Настоящий
// AppModule на MongoMemoryServer — те же гвард/пайпы/фильтры, что видит
// браузер.
import type { ApiErrorBody, GradingCommentPresetDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = { text: 'Хорошая работа, держите центр тяжести' };

describe('Заготовки комментариев (e2e)', () => {
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

  function postPreset(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/grading-presets'))
      .set('Cookie', cookie)
      .send(body);
  }

  it('GET /grading-presets без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/grading-presets');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик: GET и POST /grading-presets — 403', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const getRes = await request(server())
      .get('/api/grading-presets')
      .set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const postRes = await postPreset(cookie, VALID_BODY);
    expect(postRes.status).toBe(403);
  });

  describe('учитель', () => {
    it('CRUD целиком: create → list → patch → delete → 404', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);

      const created = await postPreset(cookie, VALID_BODY);
      expect(created.status).toBe(201);
      const dto = created.body as GradingCommentPresetDto;
      expect(dto.text).toBe(VALID_BODY.text);
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API»).
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const list = await request(server())
        .get('/api/grading-presets')
        .set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as GradingCommentPresetDto[]).some((p) => p.id === dto.id)).toBe(
        true,
      );

      const patched = await withCsrf(
        request(server()).patch(`/api/grading-presets/${dto.id}`),
      )
        .set('Cookie', cookie)
        .send({ text: 'Переписанный текст' });
      expect(patched.status).toBe(200);
      expect((patched.body as GradingCommentPresetDto).text).toBe('Переписанный текст');

      const deleted = await withCsrf(
        request(server()).delete(`/api/grading-presets/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const afterDelete = await request(server())
        .get('/api/grading-presets')
        .set('Cookie', cookie);
      expect(
        (afterDelete.body as GradingCommentPresetDto[]).some((p) => p.id === dto.id),
      ).toBe(false);
    });

    it('PATCH несуществующего id — 404', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const res = await withCsrf(
        request(server()).patch('/api/grading-presets/000000000000000000000000'),
      )
        .set('Cookie', cookie)
        .send({ text: 'x' });
      expect(res.status).toBe(404);
    });

    it('POST с пустым text — 400 (TrimString + IsNotEmpty)', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const res = await postPreset(cookie, { text: '   ' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('заготовка одного учителя видна другому — общий список школы, не личный', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const assistantCookie = await sessionCookieFor(testApp.app, ['assistant']);
      const created = await postPreset(teacherCookie, VALID_BODY);
      const dto = created.body as GradingCommentPresetDto;

      const list = await request(server())
        .get('/api/grading-presets')
        .set('Cookie', assistantCookie);

      expect(list.status).toBe(200);
      expect((list.body as GradingCommentPresetDto[]).some((p) => p.id === dto.id)).toBe(
        true,
      );
    });
  });

  it('админ: GET /grading-presets — 200', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await request(server()).get('/api/grading-presets').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
