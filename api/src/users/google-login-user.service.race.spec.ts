// Гонка первого входа через Google — тот же приём, что у
// email-login-user.service.race.spec.ts: фейковая модель форсирует E11000
// детерминированно (реальная Mongo не всегда падает на дубликате синхронно
// в каждом прогоне — google-login-user.service.spec.ts проверяет настоящую
// гонку отдельно, но не гарантирует именно эту ветку каждый раз).
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { GoogleLoginUserService } from './google-login-user.service';

const existing = {
  _id: new Types.ObjectId(),
  name: 'Анна',
  googleId: 'sub-race',
  roles: [],
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

describe('GoogleLoginUserService.createFromGoogle при E11000', () => {
  it('перечитывает документ, который записал конкурент', async () => {
    const service = new GoogleLoginUserService(
      fakeModel(() => Promise.resolve(existing)),
    );

    const user = await service.createFromGoogle({ sub: 'sub-race', name: 'Анна' });

    expect(user.id).toBe(existing._id.toString());
    expect(user.status).toBe('active');
  });

  it('E11000, но конкурента при перечитывании уже нет — явная ошибка сервера', async () => {
    const service = new GoogleLoginUserService(fakeModel(() => Promise.resolve(null)));

    await expect(
      service.createFromGoogle({ sub: 'sub-race', name: 'Анна' }),
    ).rejects.toThrow('пользователь не найден после upsert');
  });
});
