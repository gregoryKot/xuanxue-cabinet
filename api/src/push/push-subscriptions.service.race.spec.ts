// Гонка двух одновременных подписок тем же endpoint в PushSubscriptionsService
// — фейк модели воспроизводит её детерминированно, настоящая Mongo для этого
// мигала бы (тот же приём, что payments.write.race.spec.ts/
// notification-prefs.service.race.spec.ts). Обычный путь — на настоящей
// Mongo: push-subscriptions.service.spec.ts.
import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { PushSubscriptionRecord } from './push-subscription.schema';
import { PushSubscriptionsService } from './push-subscriptions.service';

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
  p256dh: 'p256dh-value',
  auth: 'auth-value',
};

function fakeConfig(): ConfigService {
  const values = {
    VAPID_PUBLIC_KEY: 'A'.repeat(87),
    VAPID_PRIVATE_KEY: 'B'.repeat(43),
    VAPID_SUBJECT: 'mailto:school@example.com',
  };
  return {
    get: (key: string) => values[key as keyof typeof values],
  } as unknown as ConfigService;
}

function leanOf(value: unknown): { lean: () => Promise<unknown> } {
  return { lean: () => Promise.resolve(value) };
}

function fakeModel(
  findOneAndUpdate: () => { lean: () => Promise<unknown> },
): Model<PushSubscriptionRecord> {
  return { findOneAndUpdate } as unknown as Model<PushSubscriptionRecord>;
}

describe('PushSubscriptionsService.subscribe — гонка двух одновременных подписок', () => {
  it('E11000 на апсерте: конкурент успел вставить первым — повтор без upsert находит его документ', async () => {
    let call = 0;
    const model = fakeModel(() => {
      call += 1;
      if (call === 1) {
        return {
          lean: () =>
            Promise.reject(
              Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
            ),
        };
      }
      return leanOf({
        _id: { toString: () => 'sub1' },
        endpoint: SUBSCRIPTION.endpoint,
        createdAt: new Date('2026-09-21T10:00:00Z'),
        updatedAt: new Date('2026-09-21T10:00:00Z'),
      });
    });
    const service = new PushSubscriptionsService(model, fakeConfig());

    const dto = await service.subscribe('u1', SUBSCRIPTION);

    expect(dto.id).toBe('sub1');
    expect(call).toBe(2);
  });

  it('ошибка, отличная от E11000, уходит наверх — тихо не проглатывается', async () => {
    const model = fakeModel(() => ({
      lean: () => Promise.reject(new Error('база недоступна')),
    }));
    const service = new PushSubscriptionsService(model, fakeConfig());

    await expect(service.subscribe('u1', SUBSCRIPTION)).rejects.toThrow(
      'база недоступна',
    );
  });
});
