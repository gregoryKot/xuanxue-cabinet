// Юнит-тест на фейковой модели (тот же приём, что attach-telegram-id.spec.ts)
// — ветки самой функции; настоящую гонку на частичном уникальном индексе
// googleId покрывает google-login-identity.service.spec.ts (mongodb-memory-server).
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { attachGoogleId } from './attach-google-id';

function fakeDoc(googleId: string): unknown {
  return {
    _id: { toString: () => 'u1' },
    name: 'Мария',
    roles: [],
    status: 'active',
    googleId,
  };
}

function fakeModel(lean: () => Promise<unknown>): Model<UserRecord> {
  return { findOneAndUpdate: () => ({ lean }) } as unknown as Model<UserRecord>;
}

describe('attachGoogleId', () => {
  it('успех — возвращает UserLean с записанным googleId', async () => {
    const model = fakeModel(() => Promise.resolve(fakeDoc('sub-1')));

    const result = await attachGoogleId(model, 'u1', 'sub-1');

    expect(result).toMatchObject({ id: 'u1', googleId: 'sub-1' });
  });

  it('условие не совпало (уже есть googleId или аккаунта нет) — null', async () => {
    const model = fakeModel(() => Promise.resolve(null));

    await expect(attachGoogleId(model, 'u1', 'sub-1')).resolves.toBeNull();
  });

  it('E11000 (гонка двух связок с одним и тем же googleId) — null, не исключение', async () => {
    const model = fakeModel(() =>
      Promise.reject(
        Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
      ),
    );

    await expect(attachGoogleId(model, 'u1', 'sub-1')).resolves.toBeNull();
  });

  it('другая ошибка базы — уходит наверх', async () => {
    const model = fakeModel(() => Promise.reject(new Error('down')));

    await expect(attachGoogleId(model, 'u1', 'sub-1')).rejects.toThrow('down');
  });
});
