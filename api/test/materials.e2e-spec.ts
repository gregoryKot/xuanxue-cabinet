// e2e на /materials и /me/materials — данные школы (ADR-0010, ADR-0047):
// доступ по роли, не по владельцу (e2e-support/README.md, «данные школы»).
// Настоящий AppModule на MongoMemoryServer — те же гвард/пайпы/фильтры, что
// видит браузер.
import type { ApiErrorBody, MaterialDto, MyMaterialDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = {
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  url: 'https://example.com/book',
  kind: 'book',
};

describe('Материалы (e2e)', () => {
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

  function postMaterial(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/materials'))
      .set('Cookie', cookie)
      .send(body);
  }

  it('GET /materials без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/materials');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик: GET и POST /materials — 403', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const getRes = await request(server()).get('/api/materials').set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const postRes = await postMaterial(cookie, VALID_BODY);
    expect(postRes.status).toBe(403);
  });

  describe('учитель', () => {
    it('CRUD целиком: create → list → patch → delete → 404', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);

      const created = await postMaterial(cookie, VALID_BODY);
      expect(created.status).toBe(201);
      const dto = created.body as MaterialDto;
      expect(dto.title).toBe(VALID_BODY.title);
      expect(dto.url).toBe(VALID_BODY.url);
      expect(dto.kind).toBe(VALID_BODY.kind);
      expect(dto.access).toBe('all');
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API»).
      expect(created.body as Record<string, unknown>).not.toHaveProperty('_id');
      expect(created.body as Record<string, unknown>).not.toHaveProperty('__v');

      const list = await request(server()).get('/api/materials').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as MaterialDto[]).some((m) => m.id === dto.id)).toBe(true);

      const patched = await withCsrf(request(server()).patch(`/api/materials/${dto.id}`))
        .set('Cookie', cookie)
        .send({ title: 'Переписанное название' });
      expect(patched.status).toBe(200);
      expect((patched.body as MaterialDto).title).toBe('Переписанное название');

      const deleted = await withCsrf(
        request(server()).delete(`/api/materials/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const afterDelete = await request(server())
        .get('/api/materials')
        .set('Cookie', cookie);
      expect((afterDelete.body as MaterialDto[]).some((m) => m.id === dto.id)).toBe(
        false,
      );
    });

    it('PATCH несуществующего id — 404', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const res = await withCsrf(
        request(server()).patch('/api/materials/000000000000000000000000'),
      )
        .set('Cookie', cookie)
        .send({ title: 'x' });
      expect(res.status).toBe(404);
    });

    it('POST с пустым title — 400 invalid_input', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const res = await postMaterial(cookie, { ...VALID_BODY, title: '   ' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('POST с url не по формату — 400 invalid_input', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const res = await postMaterial(cookie, { ...VALID_BODY, url: 'не ссылка' });
      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('материал одного учителя виден ассистенту — общий список школы, не личный', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const assistantCookie = await sessionCookieFor(testApp.app, ['assistant']);
      const created = await postMaterial(teacherCookie, VALID_BODY);
      const dto = created.body as MaterialDto;

      const list = await request(server())
        .get('/api/materials')
        .set('Cookie', assistantCookie);

      expect(list.status).toBe(200);
      expect((list.body as MaterialDto[]).some((m) => m.id === dto.id)).toBe(true);
    });
  });

  it('ученик: GET /me/materials — 200, видит материал без createdBy и access', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, VALID_BODY);

    const studentCookie = await sessionCookieFor(testApp.app, []);
    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const list = res.body as MyMaterialDto[];
    expect(list.length).toBeGreaterThan(0);
    for (const material of list) {
      expect(material).not.toHaveProperty('createdBy');
      expect(material).not.toHaveProperty('access');
    }
  });
});
