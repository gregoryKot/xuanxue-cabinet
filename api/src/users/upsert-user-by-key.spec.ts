// Юнит-тест на фейковой модели (не Mongo — гонку E11000 воспроизводит
// users.service.race.spec.ts тем же приёмом: настоящая база не всегда падает
// на дубликате детерминированно, см. комментарий там). Тут — только ветки
// самой функции: успех, E11000 → null, прочая ошибка → наверх.
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { upsertUserByKey } from './upsert-user-by-key';

function fakeModel(lean: () => Promise<unknown>): Model<UserRecord> {
  return { findOneAndUpdate: () => ({ lean }) } as unknown as Model<UserRecord>;
}

describe('upsertUserByKey', () => {
  it('успех — возвращает документ', async () => {
    const model = fakeModel(() => Promise.resolve({ _id: '1' }));

    await expect(upsertUserByKey(model, { email: 'a@example.com' }, {})).resolves.toEqual(
      { _id: '1' },
    );
  });

  it('findOneAndUpdate вернул null (защита от гипотетического пустого ответа) — null', async () => {
    const model = fakeModel(() => Promise.resolve(null));

    await expect(
      upsertUserByKey(model, { email: 'a@example.com' }, {}),
    ).resolves.toBeNull();
  });

  it('E11000 (гонка двух первых upsert) — null, не исключение', async () => {
    const model = fakeModel(() =>
      Promise.reject(
        Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
      ),
    );

    await expect(
      upsertUserByKey(model, { email: 'a@example.com' }, {}),
    ).resolves.toBeNull();
  });

  it('другая ошибка базы — уходит наверх', async () => {
    const model = fakeModel(() => Promise.reject(new Error('down')));

    await expect(upsertUserByKey(model, { email: 'a@example.com' }, {})).rejects.toThrow(
      'down',
    );
  });
});
