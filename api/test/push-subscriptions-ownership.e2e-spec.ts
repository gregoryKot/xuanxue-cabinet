// e2e на владение подписками push (ADR-0092, CLAUDE.md «Новая коллекция» и
// «API»): пользователь А не видит и не снимает подписку пользователя Б;
// секретных полей (p256dh, auth) в ответе на подписку нет ни у кого. Данные
// человека (есть userId), не школы — владение по сессии (SECURITY §3),
// доступно и ученику без единой роли (ADR-0026), образец и инструкция —
// api/test/e2e-support/README.md.
//
// Отдельный файл от push-vapid-off.e2e-spec.ts: ConfigModule.forRoot()
// валидирует env один раз при первом импорте AppModule, второй createTestApp()
// в этом же файле не увидел бы другой набор VAPID_* (тот же приём, что у
// auth-config.e2e-spec.ts/auth-config-telegram-bot.e2e-spec.ts).
import request from 'supertest';
import type {
  ApiErrorBody,
  PushPublicKeyDto,
  PushSubscriptionDto,
} from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

const VAPID_ENV = {
  VAPID_PUBLIC_KEY: 'A'.repeat(87),
  VAPID_PRIVATE_KEY: 'B'.repeat(43),
  VAPID_SUBJECT: 'mailto:school@example.com',
};

function subscriptionBody(suffix: string) {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${suffix}`,
    p256dh: `p256dh-value-${suffix}`,
    auth: `auth-value-${suffix}`,
  };
}

describe('Подписки на push — владение (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp(undefined, VAPID_ENV);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('подписался — в ответе нет p256dh/auth', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const body = subscriptionBody('secret-check');

    const res = await withCsrf(request(server()).post('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send(body);

    expect(res.status).toBe(201);
    const dto = res.body as PushSubscriptionDto;
    expect(dto.endpoint).toBe(body.endpoint);
    expect(dto.id).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('p256dh');
    expect(res.body).not.toHaveProperty('auth');
    expect(JSON.stringify(res.body)).not.toContain(body.p256dh);
    expect(JSON.stringify(res.body)).not.toContain(body.auth);
  });

  it('А не снимает подписку Б — чужой endpoint остаётся, ответ честный (204)', async () => {
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });
    const bodyB = subscriptionBody('owned-by-b');
    const subscribed = await withCsrf(
      request(server()).post('/api/me/push-subscriptions'),
    )
      .set('Cookie', cookieB)
      .send(bodyB);
    expect(subscribed.status).toBe(201);

    const res = await withCsrf(request(server()).delete('/api/me/push-subscriptions'))
      .set('Cookie', cookieA)
      .send({ endpoint: bodyB.endpoint });

    expect(res.status).toBe(204);

    // Подписка Б жива — А до неё не дотянулся.
    const stillSubscribed = await withCsrf(
      request(server()).post('/api/me/push-subscriptions'),
    )
      .set('Cookie', cookieB)
      .send(bodyB);
    expect(stillSubscribed.status).toBe(201);
    expect((stillSubscribed.body as PushSubscriptionDto).id).toBe(
      (subscribed.body as PushSubscriptionDto).id,
    );
  });

  it('своя подписка снимается', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const body = subscriptionBody('own-unsubscribe');
    await withCsrf(request(server()).post('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send(body);

    const res = await withCsrf(request(server()).delete('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send({ endpoint: body.endpoint });

    expect(res.status).toBe(204);
  });

  it('повторная отписка — снова 204, не ошибка (идемпотентно)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(request(server()).delete('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/never-subscribed' });

    expect(res.status).toBe(204);
  });

  it('без сессии — 401 на обоих маршрутах', async () => {
    const post = await withCsrf(
      request(server()).post('/api/me/push-subscriptions'),
    ).send(subscriptionBody('no-session'));
    expect(post.status).toBe(401);

    const del = await withCsrf(
      request(server()).delete('/api/me/push-subscriptions'),
    ).send({
      endpoint: 'https://fcm.googleapis.com/fcm/send/no-session',
    });
    expect(del.status).toBe(401);
  });

  it('кривой endpoint (не https URL) — 400 по-русски', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(request(server()).post('/api/me/push-subscriptions'))
      .set('Cookie', cookie)
      .send({ endpoint: 'not-a-url', p256dh: 'p256dh-value', auth: 'auth-value' });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('GET /push/public-key — ключ настроен, отдаёт его вошедшему', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await request(server()).get('/api/push/public-key').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((res.body as PushPublicKeyDto).publicKey).toBe(VAPID_ENV.VAPID_PUBLIC_KEY);
  });

  it('GET /push/public-key — без сессии 401', async () => {
    const res = await request(server()).get('/api/push/public-key');
    expect(res.status).toBe(401);
  });
});
