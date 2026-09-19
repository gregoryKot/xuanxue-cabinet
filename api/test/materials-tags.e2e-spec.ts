// e2e на теги материалов (ADR-0058) — рубрикация свободным текстом, не
// доступ: отдельный файл от materials.e2e-spec.ts, тот же приём, что у
// materials-access.e2e-spec.ts (слой 3.4). Настоящий AppModule на
// MongoMemoryServer.
import type { ApiErrorBody, MaterialDto, MyMaterialDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = {
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  url: 'https://example.com/book',
  kind: 'book',
};

describe('Теги материалов (e2e, ADR-0058)', () => {
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

  it('создание с тегами → GET отдаёт их назад нормализованными', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const created = await postMaterial(cookie, {
      ...VALID_BODY,
      tags: ['  Старшая ', 'старшая', 'разминка'],
    });

    expect(created.status).toBe(201);
    expect((created.body as MaterialDto).tags).toEqual(['Старшая', 'разминка']);

    const list = await request(server()).get('/api/materials').set('Cookie', cookie);
    const dto = (list.body as MaterialDto[]).find(
      (m) => m.id === (created.body as MaterialDto).id,
    );
    expect(dto?.tags).toEqual(['Старшая', 'разминка']);
  });

  it('GET /api/materials?tag= фильтрует по тегу', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const tagged = await postMaterial(cookie, {
      ...VALID_BODY,
      title: 'Материал со старшей группой',
      tags: ['старшая'],
    });
    await postMaterial(cookie, { ...VALID_BODY, title: 'Материал без тега' });

    const res = await request(server())
      .get('/api/materials')
      .query({ tag: 'старшая' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const ids = (res.body as MaterialDto[]).map((m) => m.id);
    expect(ids).toEqual([(tagged.body as MaterialDto).id]);
  });

  it('POST со слишком длинным тегом — 400 invalid_input', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await postMaterial(cookie, {
      ...VALID_BODY,
      tags: ['а'.repeat(41)],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('ученик: GET /me/materials отдаёт теги', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, { ...VALID_BODY, tags: ['разминка'] });

    const studentCookie = await sessionCookieFor(testApp.app, []);
    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const list = res.body as MyMaterialDto[];
    const material = list.find((m) => m.title === VALID_BODY.title);
    expect(material?.tags).toEqual(['разминка']);
  });
});
