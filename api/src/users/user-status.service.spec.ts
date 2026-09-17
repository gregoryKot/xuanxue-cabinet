// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): оба
// ограничения updateStatus (последний активный админ, самоблокировка) и
// read-after-write. Образец — user-roles.service.spec.ts; тесты, которые
// опираются на точное число активных админов в базе, берут свою изолированную
// память Mongo (`solo`), как там же.
import { UserRecord, UserSchema } from './user.schema';
import { UserStatusService } from './user-status.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

function openService(memory: MemoryMongo) {
  const model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
  const users = new UsersService(model);
  return { model, status: new UserStatusService(model, users), users };
}

describe('UserStatusService', () => {
  let memory: MemoryMongo;
  let status: UserStatusService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    ({ status, users } = openService(memory));
    await memory.connection.model<UserRecord>(UserRecord.name, UserSchema).syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('несуществующий id — NotFoundError', async () => {
    await expect(
      status.updateStatus('507f1f77bcf86cd799439011', 'blocked', 'кто-то'),
    ).rejects.toThrow('Пользователь не найден');
  });

  it('невалидный ObjectId — NotFoundError, не падение', async () => {
    await expect(status.updateStatus('не-objectid', 'blocked', 'кто-то')).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('blocked применяется и виден при повторном чтении (read-after-write)', async () => {
    const student = await users.createFromTelegram({
      telegramId: 6001,
      name: 'Ученик',
      roles: [],
      status: 'active',
    });

    const updated = await status.updateStatus(student.id, 'blocked', 'админ-id');
    expect(updated.status).toBe('blocked');

    const found = await users.findById(student.id);
    expect(found?.status).toBe('blocked');
  });

  it('закрыть доступ себе — ForbiddenError с текстом про самоблокировку', async () => {
    const solo = await openMemoryMongo();
    const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
    await soloModel.syncIndexes();
    const { status: soloStatus, users: soloUsers } = openService(solo);
    const admin = await soloUsers.createFromTelegram({
      telegramId: 6101,
      name: 'Маша',
      roles: ['admin'],
      status: 'active',
    });
    // Второй активный админ — иначе сработала бы проверка «последний
    // активный админ» раньше проверки самоблокировки, и текст ошибки был бы
    // не тот, что тестируем (порядок проверок — user-status.service.ts).
    await soloUsers.createFromTelegram({
      telegramId: 6102,
      name: 'Второй админ',
      roles: ['admin'],
      status: 'active',
    });

    await expect(soloStatus.updateStatus(admin.id, 'blocked', admin.id)).rejects.toThrow(
      'Свой доступ закрыть нельзя',
    );

    await solo.stop();
  }, 30_000);

  it('закрыть доступ последнему активному админу — ForbiddenError', async () => {
    const solo = await openMemoryMongo();
    const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
    await soloModel.syncIndexes();
    const { status: soloStatus, users: soloUsers } = openService(solo);
    const onlyAdmin = await soloUsers.createFromTelegram({
      telegramId: 6201,
      name: 'Единственный админ',
      roles: ['admin'],
      status: 'active',
    });

    await expect(
      soloStatus.updateStatus(onlyAdmin.id, 'blocked', 'кто-то-другой'),
    ).rejects.toThrow('последний администратор');

    await solo.stop();
  }, 30_000);

  it('закрыть доступ админу при живом втором активном админе — проходит', async () => {
    const solo = await openMemoryMongo();
    const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
    await soloModel.syncIndexes();
    const { status: soloStatus, users: soloUsers } = openService(solo);
    const first = await soloUsers.createFromTelegram({
      telegramId: 6301,
      name: 'Админ 1',
      roles: ['admin'],
      status: 'active',
    });
    await soloUsers.createFromTelegram({
      telegramId: 6302,
      name: 'Админ 2',
      roles: ['admin'],
      status: 'active',
    });

    const updated = await soloStatus.updateStatus(first.id, 'blocked', 'кто-то-другой');
    expect(updated.status).toBe('blocked');

    await solo.stop();
  }, 30_000);

  it('второй админ сам уже заблокирован — считаются только активные, закрыть нельзя', async () => {
    const solo = await openMemoryMongo();
    const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
    await soloModel.syncIndexes();
    const { status: soloStatus, users: soloUsers } = openService(solo);
    const first = await soloUsers.createFromTelegram({
      telegramId: 6401,
      name: 'Админ 1',
      roles: ['admin'],
      status: 'active',
    });
    await soloUsers.createFromTelegram({
      telegramId: 6402,
      name: 'Админ 2',
      roles: ['admin'],
      status: 'blocked',
    });

    await expect(
      soloStatus.updateStatus(first.id, 'blocked', 'кто-то-другой'),
    ).rejects.toThrow('последний администратор');

    await solo.stop();
  }, 30_000);

  it('обратно в active — можно, в том числе себе (идемпотентно)', async () => {
    const solo = await openMemoryMongo();
    const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
    await soloModel.syncIndexes();
    const { status: soloStatus, users: soloUsers } = openService(solo);
    const admin = await soloUsers.createFromTelegram({
      telegramId: 6501,
      name: 'Маша',
      roles: ['admin'],
      status: 'active',
    });

    const updated = await soloStatus.updateStatus(admin.id, 'active', admin.id);
    expect(updated.status).toBe('active');

    await solo.stop();
  }, 30_000);
});
