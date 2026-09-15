// e2e GET /auth/config с RESEND_API_KEY/MAIL_FROM — отдельный файл от
// auth-config.e2e-spec.ts и auth-config-telegram-bot.e2e-spec.ts (см.
// комментарий там про кеш импорта AppModule на файл): ConfigModule читает
// env один раз при первом импорте, второй createTestApp() с другими
// envOverrides в том же файле их не увидел бы.
import request from 'supertest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';

describe('GET /auth/config (e2e), с RESEND_API_KEY/MAIL_FROM', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // PUBLIC_URL уже стоит в setTestEnv() (create-app.ts) — email-вход
    // включается ровно теми тремя переменными разом (ADR-0029).
    testApp = await createTestApp(undefined, {
      RESEND_API_KEY: 're_test_key',
      MAIL_FROM: 'Школа «Сюань-Сюэ» <school@xuanxue.su>',
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('все три переменные заданы — emailLoginEnabled: true', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/auth/config');

    expect(res.status).toBe(200);
    expect((res.body as AuthConfigDto).emailLoginEnabled).toBe(true);
  });
});
