// Подтверждение человека школой (ADR-0026) против настоящей Mongo
// (mongodb-memory-server — CLAUDE.md «Тесты»). Отдельный файл от
// user-roles.service.spec.ts: тот опирается на точное число админов в базе,
// а здесь заводятся свои люди со статусами, общая база мигала бы.
import type { Model } from 'mongoose';
import { UserRecord, UserSchema } from './user.schema';
import { UserRolesService } from './user-roles.service';
import { UsersService, type UserLean } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('UserRolesService.approve', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;
  let roles: UserRolesService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    users = new UsersService(model);
    roles = new UserRolesService(model, users);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  function createPerson(status: 'invited' | 'active' | 'blocked') {
    return users.createFromTelegram({
      telegramId: 2001,
      name: 'Новенькая',
      roles: [],
      status,
    });
  }

  it('invited → active, и это видно при повторном чтении', async () => {
    const person = await createPerson('invited');

    const approved = await roles.approve(person.id);

    expect(approved.status).toBe('active');
    // Read-after-write: пишем в approve, читаем в списке «Учеников».
    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('второе нажатие — тот же человек, не ошибка', async () => {
    const person = await createPerson('invited');
    await roles.approve(person.id);

    const again = await roles.approve(person.id);

    expect(again.id).toBe(person.id);
    expect(again.status).toBe('active');
  });

  it('заблокированному — ForbiddenError, статус не меняется', async () => {
    const person = await createPerson('blocked');

    await expect(roles.approve(person.id)).rejects.toThrow('доступ закрыт');
    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'blocked',
    });
  });

  it('несуществующий id — NotFoundError', async () => {
    await expect(roles.approve('507f1f77bcf86cd799439099')).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('id не в форме ObjectId — тот же NotFoundError, не 500', async () => {
    await expect(roles.approve('не-id')).rejects.toThrow('Пользователь не найден');
  });

  // Условный апдейт `{ status: 'invited' }` не находит документа, если статус
  // успел поменяться между чтением и записью (второй админ нажал раньше).
  // На настоящей базе этот момент не поймать — фейк модели воспроизводит его
  // прямо, тем же приёмом, что users.service.race.spec.ts.
  describe('гонка двух подтверждений', () => {
    const ID = '507f1f77bcf86cd799439011';

    function racingService(afterRace: UserLean | null): UserRolesService {
      let reads = 0;
      const fakeUsers = {
        findById: () => {
          reads += 1;
          return Promise.resolve(
            reads === 1
              ? {
                  id: ID,
                  name: 'Гонка',
                  roles: [],
                  tz: 'Asia/Jerusalem',
                  status: 'invited',
                }
              : afterRace,
          );
        },
      } as unknown as UsersService;
      const fakeModel = {
        findOneAndUpdate: () => ({ lean: () => Promise.resolve(null) }),
      } as unknown as Model<UserRecord>;
      return new UserRolesService(fakeModel, fakeUsers);
    }

    it('успел другой админ — возвращаем перечитанного человека', async () => {
      const service = racingService({
        id: ID,
        name: 'Гонка',
        roles: [],
        tz: 'Asia/Jerusalem',
        status: 'active',
      });

      await expect(service.approve(ID)).resolves.toMatchObject({ status: 'active' });
    });

    it('человека уже нет — возвращаем то, что прочитали, а не падаем', async () => {
      const service = racingService(null);

      await expect(service.approve(ID)).resolves.toMatchObject({ status: 'invited' });
    });
  });
});
