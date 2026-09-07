// e2e GET /auth/config с BOT_TOKEN — отдельный файл от auth-config.e2e-spec.ts
// (см. комментарий там про кеш импорта AppModule). TEST_BOT_TOKEN
// (create-app.ts) начинается с "123456:" — числовой id бота предсказуем.
import request from 'supertest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';

describe('GET /auth/config (e2e), с BOT_TOKEN', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('200 без cookie, telegramBotId и publicUrl — полный набор ключей', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/auth/config');

    expect(res.status).toBe(200);
    const body = res.body as AuthConfigDto;
    expect(body.telegramBotId).toBe(123456);
    expect(body.publicUrl).toBe('http://localhost:3000');
    expect(Object.keys(body).sort()).toEqual(['publicUrl', 'telegramBotId']);
  });
});
