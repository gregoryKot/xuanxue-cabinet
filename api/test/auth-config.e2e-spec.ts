// e2e GET /auth/config — @Public(), экран входа спрашивает его без cookie
// (SECURITY §2, CLAUDE.md «API»). Кейс «с BOT_TOKEN» — отдельный файл
// (auth-config-telegram-bot.e2e-spec.ts): ConfigModule.forRoot() валидирует
// env один раз при первом импорте AppModule, а Node кеширует импорт на весь
// файл — второй createTestApp() в этом же файле не увидел бы env, гружёный
// между двумя beforeAll.
import request from 'supertest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';

describe('GET /auth/config (e2e), без BOT_TOKEN', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, { BOT_TOKEN: undefined });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('200 без cookie, telegramBotId отсутствует, schoolSiteUrl не задан — поля нет', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/auth/config');

    expect(res.status).toBe(200);
    const body = res.body as AuthConfigDto;
    expect(body.telegramBotId).toBeUndefined();
    expect(body.schoolSiteUrl).toBeUndefined();
    expect(Object.keys(body)).toEqual(['emailLoginEnabled', 'fileStorageEnabled']);
  });

  // Без RESEND_API_KEY/MAIL_FROM (createTestApp по умолчанию их не ставит,
  // см. e2e-support/create-app.ts) — форма почты не должна появляться на
  // экране входа (ADR-0029).
  it('без RESEND_API_KEY/MAIL_FROM — emailLoginEnabled: false', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/auth/config');

    expect((res.body as AuthConfigDto).emailLoginEnabled).toBe(false);
  });

  // Без ключей R2 (createTestApp их не ставит) поля загрузки на странице
  // материала быть не должно — ADR-0057, тем же правилом, что у почты.
  it('без переменных R2 — fileStorageEnabled: false', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/auth/config');

    expect((res.body as AuthConfigDto).fileStorageEnabled).toBe(false);
  });
});
