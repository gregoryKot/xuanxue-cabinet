// Гонка первого перехода по ссылке — тот же приём, что у
// users.service.race.spec.ts: фейковая модель форсирует E11000
// детерминированно, настоящая Mongo не всегда падает на дубликате
// синхронно (email-login-user.service.spec.ts проверяет реальную гонку
// отдельно, но она не гарантирует именно эту ветку на каждый прогон).
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { EmailLoginUserService } from './email-login-user.service';

const existing = {
  _id: new Types.ObjectId(),
  name: 'race@example.com',
  email: 'race@example.com',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function fakeModel(
  findOneResult: () => Promise<unknown>,
  upsertResult: () => Promise<unknown> = () =>
    Promise.reject(
      Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
    ),
): Model<UserRecord> {
  return {
    findOneAndUpdate: () => ({ lean: upsertResult }),
    findOne: () => ({ lean: findOneResult }),
  } as unknown as Model<UserRecord>;
}

describe('EmailLoginUserService.createFromEmail при E11000', () => {
  it('перечитывает документ, который записал конкурент', async () => {
    const service = new EmailLoginUserService(fakeModel(() => Promise.resolve(existing)));

    const user = await service.createFromEmail('race@example.com');

    expect(user.id).toBe(existing._id.toString());
    expect(user.status).toBe('active');
  });

  it('E11000, но конкурента при перечитывании уже нет — явная ошибка сервера', async () => {
    const service = new EmailLoginUserService(fakeModel(() => Promise.resolve(null)));

    await expect(service.createFromEmail('race@example.com')).rejects.toThrow(
      'пользователь не найден после upsert',
    );
  });
});
