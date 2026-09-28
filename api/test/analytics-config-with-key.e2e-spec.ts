// e2e GET /analytics/config с заданным POSTHOG_KEY — отдельный файл-приложение
// от analytics-config.e2e-spec.ts (комментарий там же: два createTestApp() с
// разным env в одном файле не работают, второй не увидел бы env).
import request from 'supertest';
import type { AnalyticsConfigDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';

describe('GET /analytics/config (e2e), с POSTHOG_KEY', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, { POSTHOG_KEY: 'phc_example' });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('200 без cookie, отдаёт ключ как есть', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/analytics/config');

    expect(res.status).toBe(200);
    expect(res.body as AnalyticsConfigDto).toEqual({ posthogKey: 'phc_example' });
  });
});
