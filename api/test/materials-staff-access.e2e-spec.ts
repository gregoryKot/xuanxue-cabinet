// e2e на `access: 'staff'` (ADR-0058) — видимость, не тег: второе (и
// последнее после ADR-0096, отменяет ADR-0048) значение `access`. Настоящий
// AppModule на MongoMemoryServer. Ученик не получает staff-материал ни в
// каком виде (grep по сырому JSON тела ответа, не только по типизированному
// DTO), штат видит его как обычный — и в общем списке штата, и в своей
// библиотеке.
import type { MaterialDto, MyMaterialDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const OPEN_MATERIAL = {
  title: 'Вводное видео',
  url: 'https://example.com/free-video',
  kind: 'video',
  access: 'all',
};
const STAFF_MATERIAL = {
  title: 'Методичка для преподавателей',
  url: 'https://example.com/staff-only',
  kind: 'document',
  access: 'staff',
};

describe('Материал «только преподаватели» (e2e, ADR-0058)', () => {
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

  // ADR-0058: значение access проходит и создание, и правку — DTO
  // валидирует по общему списку MATERIAL_ACCESS_LEVELS, второго списка нет.
  it('POST/PATCH принимают access: staff, недопустимое значение — 400', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const created = await postMaterial(cookie, { ...OPEN_MATERIAL, access: 'staff' });
    expect(created.status).toBe(201);
    expect((created.body as MaterialDto).access).toBe('staff');

    const id = (created.body as MaterialDto).id;
    const patched = await withCsrf(request(server()).patch(`/api/materials/${id}`))
      .set('Cookie', cookie)
      .send({ access: 'all' });
    expect(patched.status).toBe(200);
    expect((patched.body as MaterialDto).access).toBe('all');

    const invalid = await postMaterial(cookie, { ...OPEN_MATERIAL, access: 'teacher' });
    expect(invalid.status).toBe(400);
  });

  // ADR-0058: списковый эндпоинт штата не прячет staff-материалы — они не
  // тег и не отдельный режим списка, штат видит их как обычные.
  it('GET /materials — staff-материал в общем списке штата, не спрятан', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const created = await postMaterial(cookie, STAFF_MATERIAL);
    const dto = created.body as MaterialDto;

    const list = await request(server()).get('/api/materials').set('Cookie', cookie);

    const found = (list.body as MaterialDto[]).find((m) => m.id === dto.id);
    expect(found?.access).toBe('staff');
  });

  it('ученик не получает ни staff-материала, ни его url ни в каком поле', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, STAFF_MATERIAL);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(STAFF_MATERIAL.url);
    expect(raw).not.toContain(STAFF_MATERIAL.title);
    const material = (res.body as MyMaterialDto[]).find(
      (m) => m.title === STAFF_MATERIAL.title,
    );
    expect(material).toBeUndefined();
  });

  it('штат получает staff-материал с url', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await postMaterial(teacherCookie, STAFF_MATERIAL);

    const res = await request(server())
      .get('/api/me/materials')
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    const material = (res.body as MyMaterialDto[]).find(
      (m) => m.title === STAFF_MATERIAL.title,
    );
    expect(material?.url).toBe(STAFF_MATERIAL.url);
  });

  it('staff-материалы не съедают лимит списка ученика', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    // Открытый материал создан первым (значит, самый старый) — если бы
    // фильтр не отсекал `staff` до лимита, три более свежих служебных
    // материала вытеснили бы его со страницы limit=1 (сортировка по
    // createdAt: -1, MaterialSchema.index).
    await postMaterial(teacherCookie, OPEN_MATERIAL);
    for (let i = 0; i < 3; i += 1) {
      await postMaterial(teacherCookie, {
        ...STAFF_MATERIAL,
        title: `${STAFF_MATERIAL.title} ${i}`,
        url: `${STAFF_MATERIAL.url}-${i}`,
      });
    }
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/materials?limit=1')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const list = res.body as MyMaterialDto[];
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe(OPEN_MATERIAL.title);
  });
});
