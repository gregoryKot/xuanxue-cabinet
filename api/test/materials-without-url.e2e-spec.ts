// e2e: материал без ссылки (ADR-0133, уточняет ADR-0057 и ADR-0047) —
// отдельный файл от materials.e2e-spec.ts (184 строки, храповик размера
// файла запрещает пополнять уже отслеживаемый файл), тот же приём, что у
// materials-tags.e2e-spec.ts рядом. Настоящий AppModule на MongoMemoryServer.
import type { MaterialDto, MyMaterialDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const BODY_WITHOUT_URL = {
  title: 'Методичка одним файлом',
  kind: 'document',
};
const BODY_WITH_URL = {
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  url: 'https://example.com/book',
  kind: 'book',
};

describe('Материал без ссылки (e2e, ADR-0133)', () => {
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

  it('POST без url — 201, в теле нет ключа url', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const created = await postMaterial(cookie, BODY_WITHOUT_URL);

    expect(created.status).toBe(201);
    expect(created.body as Record<string, unknown>).not.toHaveProperty('url');
  });

  it('POST с url — работает как раньше', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const created = await postMaterial(cookie, BODY_WITH_URL);

    expect(created.status).toBe(201);
    expect((created.body as MaterialDto).url).toBe(BODY_WITH_URL.url);
  });

  it('материал без url есть в GET /materials у штата', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const created = await postMaterial(cookie, BODY_WITHOUT_URL);
    const dto = created.body as MaterialDto;

    const list = await request(server()).get('/api/materials').set('Cookie', cookie);

    expect(list.status).toBe(200);
    const found = (list.body as MaterialDto[]).find((m) => m.id === dto.id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty('url');
  });

  // Материал без ссылки и без файла ученику бесполезен (нечем открыть) —
  // STUDENT_OPENABLE_FILTER (materials.queries.ts) отсекает его ещё в запросе.
  it('материала без url и без файла нет в GET /me/materials у ученика', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const created = await postMaterial(teacherCookie, BODY_WITHOUT_URL);
    const dto = created.body as MaterialDto;

    const studentCookie = await sessionCookieFor(testApp.app, []);
    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const list = res.body as MyMaterialDto[];
    expect(list.some((m) => m.id === dto.id)).toBe(false);
  });

  it('PATCH url: null — снимает ссылку, GET после этого без url', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const created = await postMaterial(cookie, BODY_WITH_URL);
    const dto = created.body as MaterialDto;

    const patched = await withCsrf(request(server()).patch(`/api/materials/${dto.id}`))
      .set('Cookie', cookie)
      .send({ url: null });

    expect(patched.status).toBe(200);
    expect(patched.body as Record<string, unknown>).not.toHaveProperty('url');

    // Читаем заново — не полагаемся только на ответ PATCH (read-after-write).
    const list = await request(server()).get('/api/materials').set('Cookie', cookie);
    const reloaded = (list.body as MaterialDto[]).find((m) => m.id === dto.id);
    expect(reloaded).not.toHaveProperty('url');
  });

  it('PATCH url кривым форматом — 400 invalid_input, null не путаем со строкой', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const created = await postMaterial(cookie, BODY_WITH_URL);
    const dto = created.body as MaterialDto;

    const res = await withCsrf(request(server()).patch(`/api/materials/${dto.id}`))
      .set('Cookie', cookie)
      .send({ url: 'не ссылка' });

    expect(res.status).toBe(400);
  });
});
