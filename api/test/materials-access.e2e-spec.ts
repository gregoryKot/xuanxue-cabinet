// e2e на слой 3.4 (docs/PLAN.md §14, ADR-0048) — рубильник школы
// `materialsPaidAccess` прячет `url` paid-материала от ученика и не трогает
// штат. Настоящий AppModule на MongoMemoryServer, гейт из ADR-0048 (раздел
// «Последствия»). Тот же приём проверки, что у my-lessons-archive.e2e-spec.ts:
// грепаем сырой JSON тела ответа, не только типизированный DTO — ссылка не
// должна проступить ни в каком поле.
import type { MyMaterialDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const PAID_MATERIAL = {
  title: 'Разбор толкающих рук',
  url: 'https://example.com/paid-video',
  kind: 'video',
  access: 'paid',
};
const OPEN_MATERIAL = {
  title: 'Вводное видео',
  url: 'https://example.com/free-video',
  kind: 'video',
  access: 'all',
};

describe('Доступ к материалам по оплате (e2e, ADR-0048)', () => {
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

  function patchSettings(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send(body);
  }

  it('рубильник выключен по умолчанию — ученик получает url paid-материала', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, PAID_MATERIAL);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const material = (res.body as MyMaterialDto[]).find(
      (m) => m.title === PAID_MATERIAL.title,
    );
    expect(material?.url).toBe(PAID_MATERIAL.url);
    expect(material).not.toHaveProperty('locked');
  });

  it('рубильник включён — в сыром JSON ученику url paid-материала нет, locked:true', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, PAID_MATERIAL);
    const settingsRes = await patchSettings(teacherCookie, { materialsPaidAccess: true });
    expect(settingsRes.status).toBe(200);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(PAID_MATERIAL.url);
    const material = (res.body as MyMaterialDto[]).find(
      (m) => m.title === PAID_MATERIAL.title,
    );
    expect(material?.locked).toBe(true);
    expect(material).not.toHaveProperty('url');
  });

  it('рубильник включён — штат получает url paid-материала на том же запросе', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, PAID_MATERIAL);
    await patchSettings(teacherCookie, { materialsPaidAccess: true });

    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    const material = (res.body as MyMaterialDto[]).find(
      (m) => m.title === PAID_MATERIAL.title,
    );
    expect(material?.url).toBe(PAID_MATERIAL.url);
    expect(material).not.toHaveProperty('locked');
  });

  it('рубильник включён — материал «all» остаётся открыт ученику', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, OPEN_MATERIAL);
    await patchSettings(teacherCookie, { materialsPaidAccess: true });
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    const material = (res.body as MyMaterialDto[]).find(
      (m) => m.title === OPEN_MATERIAL.title,
    );
    expect(material?.url).toBe(OPEN_MATERIAL.url);
    expect(material).not.toHaveProperty('locked');
  });
});
