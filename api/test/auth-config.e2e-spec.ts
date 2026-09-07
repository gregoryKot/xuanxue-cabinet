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

  it('200 без cookie, telegramBotId отсутствует, publicUrl остаётся', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/auth/config');

    expect(res.status).toBe(200);
    const body = res.body as AuthConfigDto;
    expect(body.telegramBotId).toBeUndefined();
    expect(body.publicUrl).toBe('http://localhost:3000');
    expect(Object.keys(body).sort()).toEqual(['publicUrl']);
  });
});
