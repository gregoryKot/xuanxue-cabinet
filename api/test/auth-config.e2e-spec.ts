// e2e GET /auth/config — @Public(), экран входа спрашивает его без cookie
// (SECURITY §2, CLAUDE.md «API»). Кейс «с BOT_TOKEN» — отдельный файл
// (auth-config-telegram-bot.e2e-spec.ts): ConfigModule.forRoot() валидирует
// env один раз при первом импорте AppModule, а Node кеширует импорт на весь
// файл — второй createTestApp() в этом же файле не увидел бы env, гружёный
// между двумя beforeAll.
import request from 'supertest';
import {
  TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE,
  type ApiErrorBody,
  type AuthConfigDto,
} from '@xuanxue/shared';
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
    expect(Object.keys(body)).toEqual([
      'emailLoginEnabled',
      'googleLoginEnabled',
      'telegramOidcEnabled',
      'fileStorageEnabled',
    ]);
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

  // Без TELEGRAM_LOGIN_CLIENT_SECRET (createTestApp его не ставит) кабинет
  // остаётся на прежнем входе через виджет (ADR-0028, ADR-0187): кнопка не
  // уходит на адрес, который ответит 503.
  it('без TELEGRAM_LOGIN_CLIENT_SECRET — telegramOidcEnabled: false, start и вход отвечают 503', async () => {
    const server = testApp.app.getHttpServer();

    const config = await request(server).get('/api/auth/config');
    const start = await request(server).get('/api/auth/telegram/oidc/start');
    const login = await request(server)
      .post('/api/auth/telegram/oidc')
      .set('x-requested-with', 'fetch')
      .send({ code: 'x'.repeat(20), state: 'a'.repeat(43) });

    expect((config.body as AuthConfigDto).telegramOidcEnabled).toBe(false);
    expect(start.status).toBe(503);
    expect(login.status).toBe(503);
    expect((login.body as ApiErrorBody).message).toBe(
      TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE,
    );
  });
});
