// Гонки в payments.write.ts — фейк модели воспроизводит их детерминированно,
// настоящая Mongo для этого мигала бы (тот же приём, что
// notification-prefs.service.race.spec.ts). Обычный путь проверен на
// настоящей Mongo — payments.service.spec.ts.
import type { Model } from 'mongoose';
import { DateTime } from 'luxon';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { PaymentRecord } from './payment.schema';
import { confirmPayment, revokePayment } from './payments.write';

const NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });
const USER_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439012';

function leanOf(value: unknown): { lean: () => Promise<unknown> } {
  return { lean: () => Promise.resolve(value) };
}

function fakeModel(overrides: {
  findOne?: () => { lean: () => Promise<unknown> };
  findOneAndUpdate?: () => { lean: () => Promise<unknown> };
}): Model<PaymentRecord> {
  return {
    findOne: overrides.findOne ?? (() => leanOf(null)),
    findOneAndUpdate: overrides.findOneAndUpdate ?? (() => leanOf(null)),
  } as unknown as Model<PaymentRecord>;
}

describe('confirmPayment — гонка двух кликов', () => {
  it('E11000 на апсерте: конкурент успел вставить — повтор апдейта находит его документ', async () => {
    let call = 0;
    const model = fakeModel({
      findOneAndUpdate: () => {
        call += 1;
        if (call === 1) {
          return {
            lean: () =>
              Promise.reject(
                Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
              ),
          };
        }
        return leanOf({ userId: USER_ID, month: '2026-09', status: 'paid' });
      },
    });

    const doc = await confirmPayment(model, USER_ID, '2026-09', {}, ACTOR_ID, NOW);

    expect(doc.status).toBe('paid');
    expect(call).toBe(2);
  });

  it('E11000 на апсерте, но и повтор без upsert ничего не находит — исходная ошибка наверх', async () => {
    // Крайний случай гонки: конкурент успел не только вставить, но и удалить
    // документ до того, как этот запрос повторил апдейт (двойной клик +
    // revoke почти одновременно) — не проглатываем, не выдаём «оплатил»
    // молча, когда на самом деле ничего не записали.
    const original = Object.assign(new Error('E11000'), {
      code: MONGO_DUPLICATE_KEY_CODE,
    });
    let call = 0;
    const model = fakeModel({
      findOneAndUpdate: () => {
        call += 1;
        if (call === 1) return { lean: () => Promise.reject(original) };
        return leanOf(null);
      },
    });

    await expect(
      confirmPayment(model, USER_ID, '2026-09', {}, ACTOR_ID, NOW),
    ).rejects.toBe(original);
    expect(call).toBe(2);
  });

  it('ошибка, отличная от E11000, уходит наверх — тихо не проглатываем', async () => {
    const model = fakeModel({
      findOneAndUpdate: () => ({
        lean: () => Promise.reject(new Error('база недоступна')),
      }),
    });

    await expect(
      confirmPayment(model, USER_ID, '2026-09', {}, ACTOR_ID, NOW),
    ).rejects.toThrow('база недоступна');
  });

  it('уже `paid` — второй клик не идёт в запись вовсе', async () => {
    let updates = 0;
    const model = fakeModel({
      findOne: () => leanOf({ userId: USER_ID, month: '2026-09', status: 'paid' }),
      findOneAndUpdate: () => {
        updates += 1;
        return leanOf(null);
      },
    });

    await confirmPayment(model, USER_ID, '2026-09', {}, ACTOR_ID, NOW);

    expect(updates).toBe(0);
  });
});

describe('revokePayment — документ исчезает между findOne и findOneAndUpdate', () => {
  it('документ был paid со скриншотом, но апдейт его не находит — ошибка, не тихий null', async () => {
    const model = fakeModel({
      findOne: () => leanOf({ _id: 'p1', status: 'paid', screenshotKind: 'telegram' }),
      findOneAndUpdate: () => leanOf(null),
    });

    // Не воспроизводимо на настоящей Mongo детерминированно (тот же приём,
    // что у гонки confirmPayment выше) — документ, который findOne только
    // что нашёл, findOneAndUpdate по его же _id не находит: второй инстанс
    // успел удалить его между двумя запросами.
    await expect(revokePayment(model, USER_ID, '2026-09')).rejects.toThrow(
      'revokePayment: документ не найден сразу после апдейта',
    );
  });
});
