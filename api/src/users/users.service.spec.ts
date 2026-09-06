// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): read-after-write для findById/findByTelegramId/touchLogin.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { UserRecord, UserSchema } from './user.schema';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('UsersService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    // Индексы Mongoose строит в фоне после компиляции модели; без явного
    // ожидания гонка двух первых входов иногда бежала без уникального
    // индекса и создавала двух пользователей (мигающий тест в CI).
    await model.syncIndexes();
    service = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('findById: невалидный ObjectId — null, без обращения к базе', async () => {
    await expect(service.findById('не-id')).resolves.toBeNull();
  });

  it('findById: валидный, но несуществующий id — null', async () => {
    const missingId = '507f1f77bcf86cd799439011';
    await expect(service.findById(missingId)).resolves.toBeNull();
  });

  it('createFromTelegram → findById: read-after-write', async () => {
    const created = await service.createFromTelegram({
      telegramId: 111,
      name: 'Дима',
      roles: ['teacher'],
    });
    expect(created).toMatchObject({ name: 'Дима', telegramId: 111, roles: ['teacher'] });

    const found = await service.findById(created.id);
    expect(found).toMatchObject({ id: created.id, name: 'Дима', telegramId: 111 });
  });

  it('findByTelegramId находит созданного пользователя', async () => {
    const created = await service.createFromTelegram({
      telegramId: 222,
      name: 'Маша',
      roles: [],
    });
    const found = await service.findByTelegramId(222);
    expect(found).toMatchObject({ id: created.id, name: 'Маша' });
  });

  it('findByTelegramId: нет такого — null', async () => {
    await expect(service.findByTelegramId(999_999)).resolves.toBeNull();
  });

  it('два параллельных createFromTelegram с одним telegramId — один документ', async () => {
    const [first, second] = await Promise.all([
      service.createFromTelegram({ telegramId: 444, name: 'Первый', roles: ['teacher'] }),
      service.createFromTelegram({ telegramId: 444, name: 'Второй', roles: ['admin'] }),
    ]);

    expect(first.id).toBe(second.id);
    expect(first).toEqual(second);
    const count = await model.countDocuments({ telegramId: 444 });
    expect(count).toBe(1);
  });

  it('touchLogin проставляет lastLoginAt из переданного now, не Date.now()', async () => {
    const created = await service.createFromTelegram({
      telegramId: 333,
      name: 'Ученик',
      roles: ['student'],
    });
    const now = DateTime.fromISO('2026-09-05T10:00:00Z');

    await service.touchLogin(created.id, now);

    const found = await service.findById(created.id);
    expect(found?.lastLoginAt?.toISOString()).toBe(now.toJSDate().toISOString());
  });
});
