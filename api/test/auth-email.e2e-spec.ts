// e2e POST /auth/email/request и /verify — окружение по умолчанию, БЕЗ
// RESEND_API_KEY/MAIL_FROM (SECURITY §2, ADR-0005, ADR-0029). Сценарий «Resend
// подключён» — отдельный файл, auth-email-resend.e2e-spec.ts: ConfigModule
// валидирует env один раз при первом импорте AppModule, второй createTestApp()
// в этом же файле его не увидел бы (тот же приём, что у auth-config.e2e-spec.ts
// и auth-config-telegram-bot.e2e-spec.ts — комментарий там подробнее).
import request from 'supertest';
import type { ApiErrorBody } from '@xuanxue/shared';
import {
  EMAIL_LOGIN_EXPIRED_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';

// Приватный диапазон TEST-NET-3 (RFC 5737) — свой IP на тест, троттлер (лимит
// по IP) не должен смешивать бакеты (тот же приём, что у auth-telegram.e2e-spec.ts).
let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /auth/email/request и /verify (e2e), Resend не подключён', () => {
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

  function postRequest(email: unknown, ip: string): request.Test {
    return request(server())
      .post('/api/auth/email/request')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send({ email });
  }

  it('без RESEND_API_KEY/MAIL_FROM — 503, текст «не подключён», без утечки состояния', async () => {
    const res = await postRequest('дима@example.com', freshIp());

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      statusCode: 503,
      code: 'not_available',
      message: EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
    });
  });

  it('невалидный email — 400, не 503 (валидация раньше сервиса)', async () => {
    const res = await postRequest('не-email', freshIp());
    expect(res.status).toBe(400);
  });

  it('без x-requested-with — 403 (CSRF действует и для @Public())', async () => {
    const res = await request(server())
      .post('/api/auth/email/request')
      .set('x-forwarded-for', freshIp())
      .send({ email: 'a@example.com' });

    expect(res.status).toBe(403);
  });

  it('11-й запрос с одного IP за минуту — 429 в конверте', async () => {
    const ip = freshIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await postRequest(`a${attempt}@example.com`, ip);
      expect(res.status).toBe(503); // выключено конфигурацией, но троттлер считает независимо
    }

    const res = await postRequest('a10@example.com', ip);

    expect(res.status).toBe(429);
    expect((res.body as ApiErrorBody).code).toBe('rate_limited');
  }, 30_000);

  it('verify: токен неизвестен — 401, текст про устаревшую/использованную ссылку', async () => {
    const res = await request(server())
      .post('/api/auth/email/verify')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', freshIp())
      .send({ token: 'a'.repeat(64) });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
      message: EMAIL_LOGIN_EXPIRED_MESSAGE,
    });
  });

  it('verify: токен не 64-hex — 400 (DTO), не доходит до сервиса', async () => {
    const res = await request(server())
      .post('/api/auth/email/verify')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', freshIp())
      .send({ token: 'коротко' });

    expect(res.status).toBe(400);
  });
});
