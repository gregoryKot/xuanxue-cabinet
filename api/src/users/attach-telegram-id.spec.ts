// Юнит-тест на фейковой модели (не Mongo — тот же приём, что у
// upsert-user-by-key.spec.ts): ветки самой функции — успех, условие не
// совпало, явный E11000, прочая ошибка. Настоящую гонку на частичном
// уникальном индексе telegramId покрывает telegram-link.service.spec.ts —
// там видна вся связка целиком, против mongodb-memory-server.
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { attachTelegramId } from './attach-telegram-id';

function fakeDoc(telegramId: number): unknown {
  return {
    _id: { toString: () => 'u1' },
    name: 'Мария',
    roles: [],
    status: 'active',
    telegramId,
  };
}

function fakeModel(lean: () => Promise<unknown>): Model<UserRecord> {
  return { findOneAndUpdate: () => ({ lean }) } as unknown as Model<UserRecord>;
}

describe('attachTelegramId', () => {
  it('успех — возвращает UserLean с записанным telegramId', async () => {
    const model = fakeModel(() => Promise.resolve(fakeDoc(42)));

    const result = await attachTelegramId(model, 'u1', 42);

    expect(result).toMatchObject({ id: 'u1', telegramId: 42 });
  });

  it('условие не совпало (уже есть telegramId или аккаунта нет) — null', async () => {
    const model = fakeModel(() => Promise.resolve(null));

    await expect(attachTelegramId(model, 'u1', 42)).resolves.toBeNull();
  });

  it('E11000 (гонка двух связок с одним и тем же telegramId) — null, не исключение', async () => {
    const model = fakeModel(() =>
      Promise.reject(
        Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
      ),
    );

    await expect(attachTelegramId(model, 'u1', 42)).resolves.toBeNull();
  });

  it('другая ошибка базы — уходит наверх', async () => {
    const model = fakeModel(() => Promise.reject(new Error('down')));

    await expect(attachTelegramId(model, 'u1', 42)).rejects.toThrow('down');
  });
});
