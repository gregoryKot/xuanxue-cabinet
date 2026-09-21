// e2e без переменных VAPID_* (ADR-0092): push выключен конфигурацией — честный
// отказ на подписку и { publicKey: null }, не 500 и не обязательная
// переменная. createTestApp() по умолчанию их не ставит (e2e-support/create-app.ts),
// отдельного envOverrides не нужно. Отдельный файл от
// push-subscriptions-ownership.e2e-spec.ts — см. комментарий там про кеш
// импорта AppModule/ConfigModule.forRoot().
import request from 'supertest';
import type { ApiErrorBody, PushPublicKeyDto } from '@xuanxue/shared';
import { PUSH_NOT_AVAILABLE_MESSAGE } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Push без VAPID_* (e2e)', () => {
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

  it('GET /push/public-key — publicKey: null, не ошибка', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await request(server()).get('/api/push/public-key').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((res.body as PushPublicKeyDto).publicKey).toBeNull();
  });

  it('POST /me/push-subscriptions — честный 503, не 500, и ничего не пишет', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(request(server()).post('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-off',
        p256dh: 'p256dh-value',
        auth: 'auth-value',
      });

    expect(res.status).toBe(503);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('not_available');
    expect(body.message).toBe(PUSH_NOT_AVAILABLE_MESSAGE);
  });

  it('DELETE /me/push-subscriptions работает и без VAPID — отписка не зависит от конфигурации', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(request(server()).delete('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-off' });

    expect(res.status).toBe(204);
  });
});
