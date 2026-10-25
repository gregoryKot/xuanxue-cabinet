// e2e: удаление аккаунта обнуляет ссылки на автора (USER_REFERENCE_PATHS), а
// списки школы после этого остаются читаемыми. Отдельный файл от
// users-delete.e2e-spec.ts: тот уже у границы файл-храповика (150 строк).
// Регрессия инцидента 2026-10-02: GET /api/materials → 500 после удаления
// аккаунта автора (createdBy был required, маппер звал `.toString()` на
// снятом `$unset`-ом поле).
import request from 'supertest';
import type {
  GradingCommentPresetDto,
  MaterialDto,
  SchoolEventDto,
} from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('DELETE /users/:id — ссылки на автора (e2e)', () => {
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

  it('удаление автора материала, заготовки и события — списки отдают 200, createdBy отсутствует', async () => {
    const admin = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    const author = await createUserWithSession(testApp.app, {
      name: 'Автор',
      roles: ['teacher'],
    });
    const material = await withCsrf(request(server()).post('/api/materials'))
      .set('Cookie', author.cookie)
      .send({ title: 'Ба-гуа-чжан', url: 'https://example.com/book', kind: 'book' });
    const preset = await withCsrf(request(server()).post('/api/grading-presets'))
      .set('Cookie', author.cookie)
      .send({ text: 'Держите центр тяжести' });
    const schoolEvent = await withCsrf(request(server()).post('/api/events'))
      .set('Cookie', author.cookie)
      .send({ title: 'Ретрит', startsAt: '2030-11-20T07:00:00Z' });
    const materialId = (material.body as MaterialDto).id;
    const presetId = (preset.body as GradingCommentPresetDto).id;
    expect((material.body as MaterialDto).createdBy).toBe(author.userId);

    const deleted = await withCsrf(
      request(server()).delete(`/api/users/${author.userId}`),
    ).set('Cookie', admin.cookie);
    expect(deleted.status).toBe(204);

    const materials = await request(server())
      .get('/api/materials')
      .set('Cookie', admin.cookie);
    expect(materials.status).toBe(200);
    const listedMaterial = (materials.body as MaterialDto[]).find(
      (m) => m.id === materialId,
    );
    expect(listedMaterial?.title).toBe('Ба-гуа-чжан');
    expect(listedMaterial?.createdBy).toBeUndefined();

    const presets = await request(server())
      .get('/api/grading-presets')
      .set('Cookie', admin.cookie);
    expect(presets.status).toBe(200);
    const listedPreset = (presets.body as GradingCommentPresetDto[]).find(
      (p) => p.id === presetId,
    );
    expect(listedPreset?.text).toBe('Держите центр тяжести');
    expect(listedPreset?.createdBy).toBeUndefined();

    // События школы (ADR-0177): тот же $unset, событие остаётся на доске.
    const events = await request(server()).get('/api/events').set('Cookie', admin.cookie);
    expect(events.status).toBe(200);
    const listedEvent = (events.body as SchoolEventDto[]).find(
      (e) => e.id === (schoolEvent.body as SchoolEventDto).id,
    );
    expect(listedEvent?.title).toBe('Ретрит');
    expect(listedEvent?.createdBy).toBeUndefined();
  });
});
