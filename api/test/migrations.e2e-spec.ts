// Обещание раннера миграций — «применились раньше, чем приложение начало
// отвечать» (migration.runner.ts). Юнит-тест раннера проверяет сам механизм
// на фейковых миграциях; здесь — настоящий AppModule на чистой базе: если
// реестр перестанут подключать или хук сменят на более поздний, расписание
// школы не появится при деплое, и молча — тест ловит это здесь.
import type { ClassDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';

const EXPECTED_CLASSES = 11;

describe('Миграции при старте (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('на чистой базе расписание школы уже видно учителю', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await request(testApp.app.getHttpServer())
      .get('/api/classes')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const classes = res.body as ClassDto[];
    expect(classes).toHaveLength(EXPECTED_CLASSES);
    // Расшифровка по дороге из базы в ответ — отдельное место, где всё может
    // разойтись: название лежит зашифрованным, и пустая строка здесь означала
    // бы, что маппер отдаёт сырой шифротекст или ничего.
    expect(classes.every((cls) => cls.title.length > 0)).toBe(true);
    // Ссылок Zoom тут нет и быть не должно: они приезжают из
    // `api/seed/zoom-links.local.json`, которого в репозитории и в CI нет
    // (ADR-0019, дополнение 2026-09-12). На чистой установке ссылку впишет
    // учитель, а пропущенные видно по метке «без ссылки» в расписании.
    expect(classes.every((cls) => !cls.zoomLink)).toBe(true);
  });
});
