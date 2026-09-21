// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): уникальность endpoint, upsert вместо дубля, смена владельца при
// повторной подписке другим человеком, отписка чужого endpoint ничего не
// трогает, read-after-write с расшифрованными ключами.
import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { PUSH_NOT_AVAILABLE_MESSAGE, type SubscribePushInput } from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { decryptPushSubscription } from './push-subscription.mapper';
import { PushSubscriptionRecord } from './push-subscription.schema';
import { PushSubscriptionsService } from './push-subscriptions.service';
import type { RawLeanPushSubscription } from './push-subscription.mapper';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const VAPID_CONFIGURED = fakeConfig({
  VAPID_PUBLIC_KEY: 'A'.repeat(87),
  VAPID_PRIVATE_KEY: 'B'.repeat(43),
  VAPID_SUBJECT: 'mailto:school@example.com',
});
const VAPID_OFF = fakeConfig({});

const SUBSCRIPTION_A: SubscribePushInput = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
  p256dh: 'p256dh-value-a',
  auth: 'auth-value-a',
};

describe('PushSubscriptionsService', () => {
  let memory: MemoryMongo;
  let model: Model<PushSubscriptionRecord>;
  let service: PushSubscriptionsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<PushSubscriptionRecord>(PushSubscriptionRecord.name);
    service = new PushSubscriptionsService(model, VAPID_CONFIGURED);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('VAPID не настроен — NotAvailableError, ничего не пишет', async () => {
    const off = new PushSubscriptionsService(model, VAPID_OFF);

    await expect(off.subscribe('u1', SUBSCRIPTION_A)).rejects.toMatchObject({
      message: PUSH_NOT_AVAILABLE_MESSAGE,
    });
    await expect(off.subscribe('u1', SUBSCRIPTION_A)).rejects.toBeInstanceOf(
      NotAvailableError,
    );
    expect(await model.countDocuments({})).toBe(0);
  });

  it('подписался → нашёлся, с расшифрованными ключами (read-after-write)', async () => {
    const dto = await service.subscribe('u1', SUBSCRIPTION_A);
    expect(dto.endpoint).toBe(SUBSCRIPTION_A.endpoint);

    const raw = await model
      .findOne({ endpoint: SUBSCRIPTION_A.endpoint })
      .lean<RawLeanPushSubscription>();
    expect(raw).not.toBeNull();
    // Как реально лежит в базе — не открытый текст (SECURITY §5).
    expect(raw?.p256dh).not.toBe(SUBSCRIPTION_A.p256dh);
    expect(raw?.auth).not.toBe(SUBSCRIPTION_A.auth);

    const decrypted = decryptPushSubscription(raw as RawLeanPushSubscription);
    expect(decrypted.p256dh).toBe(SUBSCRIPTION_A.p256dh);
    expect(decrypted.auth).toBe(SUBSCRIPTION_A.auth);
    expect(decrypted.userId).toBe('u1');
  });

  it('ответ на подписку не несёт p256dh/auth', async () => {
    const dto = await service.subscribe('u1', SUBSCRIPTION_A);
    expect(dto).not.toHaveProperty('p256dh');
    expect(dto).not.toHaveProperty('auth');
  });

  it('второй POST того же endpoint — upsert, не дубль (идемпотентность)', async () => {
    await service.subscribe('u1', SUBSCRIPTION_A);
    await service.subscribe('u1', { ...SUBSCRIPTION_A, p256dh: 'p256dh-value-a-2' });

    expect(await model.countDocuments({ endpoint: SUBSCRIPTION_A.endpoint })).toBe(1);
    const raw = await model
      .findOne({ endpoint: SUBSCRIPTION_A.endpoint })
      .lean<RawLeanPushSubscription>();
    expect(decryptPushSubscription(raw as RawLeanPushSubscription).p256dh).toBe(
      'p256dh-value-a-2',
    );
  });

  it('общий браузер, второй человек подписался тем же endpoint — userId переписан', async () => {
    await service.subscribe('u1', SUBSCRIPTION_A);
    await service.subscribe('u2', SUBSCRIPTION_A);

    expect(await model.countDocuments({ endpoint: SUBSCRIPTION_A.endpoint })).toBe(1);
    const raw = await model
      .findOne({ endpoint: SUBSCRIPTION_A.endpoint })
      .lean<RawLeanPushSubscription>();
    expect(raw?.userId).toBe('u2');
  });

  it('endpoint уникален на уровне индекса — второй insert напрямую падает', async () => {
    await model.create({
      userId: 'u1',
      endpoint: SUBSCRIPTION_A.endpoint,
      p256dh: 'x',
      auth: 'y',
    });
    await expect(
      model.create({
        userId: 'u2',
        endpoint: SUBSCRIPTION_A.endpoint,
        p256dh: 'x2',
        auth: 'y2',
      }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
  });

  it('отписка своего endpoint удаляет запись', async () => {
    await service.subscribe('u1', SUBSCRIPTION_A);

    await service.unsubscribe('u1', SUBSCRIPTION_A.endpoint);

    expect(await model.countDocuments({})).toBe(0);
  });

  it('отписка чужого endpoint ничего не трогает — не ошибка', async () => {
    await service.subscribe('u1', SUBSCRIPTION_A);

    await expect(
      service.unsubscribe('u2', SUBSCRIPTION_A.endpoint),
    ).resolves.toBeUndefined();

    expect(await model.countDocuments({})).toBe(1);
  });

  it('повторная отписка (уже удалено) — идемпотентна, не ошибка', async () => {
    await service.subscribe('u1', SUBSCRIPTION_A);
    await service.unsubscribe('u1', SUBSCRIPTION_A.endpoint);

    await expect(
      service.unsubscribe('u1', SUBSCRIPTION_A.endpoint),
    ).resolves.toBeUndefined();
  });

  it('isEnabled отражает настройку VAPID', () => {
    expect(service.isEnabled).toBe(true);
    expect(new PushSubscriptionsService(model, VAPID_OFF).isEnabled).toBe(false);
  });

  it('listEndpointsFor: подписался → нашёлся по userId (read-after-write), без p256dh/auth', async () => {
    await service.subscribe('u1', SUBSCRIPTION_A);
    await service.subscribe('u1', {
      ...SUBSCRIPTION_A,
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-2',
    });
    await service.subscribe('u2', {
      ...SUBSCRIPTION_A,
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-other-user',
    });

    const endpoints = await service.listEndpointsFor('u1');

    expect(endpoints.sort()).toEqual(
      [SUBSCRIPTION_A.endpoint, 'https://fcm.googleapis.com/fcm/send/device-2'].sort(),
    );
  });

  it('listEndpointsFor: человек без подписок — пустой список, не ошибка', async () => {
    await expect(service.listEndpointsFor('нет-такого')).resolves.toEqual([]);
  });
});
