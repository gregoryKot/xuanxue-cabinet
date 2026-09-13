// Гонка первого входа: Mongo не всегда повторяет upsert при E11000 на
// частичном уникальном индексе, поэтому сервис обязан сам перечитать
// документ конкурента. Фейк модели воспроизводит именно этот сценарий —
// на настоящей базе он мигает, а не воспроизводится.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { UsersService } from './users.service';

const existing = {
  _id: new Types.ObjectId(),
  name: 'Первый',
  telegramId: 7,
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function fakeModel(upsertResult: () => Promise<unknown>): Model<UserRecord> {
  return {
    findOneAndUpdate: () => ({ lean: upsertResult }),
    findOne: () => ({ lean: () => Promise.resolve(existing) }),
  } as unknown as Model<UserRecord>;
}

describe('UsersService.createFromTelegram при E11000', () => {
  it('перечитывает документ, который записал конкурент', async () => {
    const service = new UsersService(
      fakeModel(() =>
        Promise.reject(
          Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
        ),
      ),
    );
    const user = await service.createFromTelegram({
      telegramId: 7,
      name: 'Второй',
      roles: ['admin'],
      status: 'active',
    });
    expect(user.id).toBe(existing._id.toString());
    expect(user.roles).toEqual([]);
  });

  it('другая ошибка базы уходит наверх', async () => {
    const service = new UsersService(fakeModel(() => Promise.reject(new Error('down'))));
    await expect(
      service.createFromTelegram({
        telegramId: 7,
        name: 'x',
        roles: [],
        status: 'active',
      }),
    ).rejects.toThrow('down');
  });

  it('E11000, но конкурента при перечитывании уже нет — явная ошибка сервера', async () => {
    // Защита в глубину: по индексу дубликат есть, а findOne(telegramId) не
    // находит документ (гипотетическая рассинхронизация с базой) — сервис не
    // должен молча вернуть undefined вызывающему коду.
    const model = {
      findOneAndUpdate: () => ({
        lean: () =>
          Promise.reject(
            Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
          ),
      }),
      findOne: () => ({ lean: () => Promise.resolve(null) }),
    } as unknown as Model<UserRecord>;
    const service = new UsersService(model);

    await expect(
      service.createFromTelegram({
        telegramId: 7,
        name: 'x',
        roles: [],
        status: 'active',
      }),
    ).rejects.toThrow('пользователь не найден после upsert');
  });
});
