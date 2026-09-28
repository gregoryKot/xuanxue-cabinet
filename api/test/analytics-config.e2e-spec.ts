// e2e GET /analytics/config — @Public(), тот же приём, что auth-config.e2e-spec.ts:
// доступен без сессии, без POSTHOG_KEY отвечает { posthogKey: null } (ADR-0143).
// Кейс «с POSTHOG_KEY» — отдельный файл (analytics-config-with-key.e2e-spec.ts):
// ConfigModule.forRoot() валидирует env один раз при первом импорте AppModule, и
// Node кеширует импорт на весь файл — второй createTestApp() в этом же файле не
// увидел бы env, гружёный между двумя beforeAll (см. auth-config.e2e-spec.ts).
import request from 'supertest';
import type { AnalyticsConfigDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';

describe('GET /analytics/config (e2e), без POSTHOG_KEY', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('200 без cookie, posthogKey: null', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/analytics/config');

    expect(res.status).toBe(200);
    expect(res.body as AnalyticsConfigDto).toEqual({ posthogKey: null });
  });

  // Контроллер целиком @Public() — данных владения тут нет, отказ проверяем
  // на несуществующем под-пути (check-ownership-e2e.mjs требует утверждение
  // об отказе на каждый контроллер, README «Как писать ownership-тест»).
  it('GET /api/analytics/nope — 404, а не 200', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/analytics/nope');

    expect(res.status).toBe(404);
  });
});
