// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): имя меняется и видно при повторном чтении (read-after-write),
// несуществующий и невалидный id, чужая запись не тронута.
import { UserRecord, UserSchema } from './user.schema';
import { OwnNameService } from './own-name.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('OwnNameService', () => {
  let memory: MemoryMongo;
  let ownName: OwnNameService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    const model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    ownName = new OwnNameService(model);
    users = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('меняет имя и читает его обратно (read-after-write)', async () => {
    const student = await users.createFromTelegram({
      telegramId: 7_001,
      name: 'doctor.martynova@gmail.com',
      roles: [],
      status: 'active',
    });

    const updated = await ownName.renameSelf(student.id, 'Марина Мартынова');
    expect(updated.name).toBe('Марина Мартынова');

    const found = await users.findById(student.id);
    expect(found?.name).toBe('Марина Мартынова');
  });

  it('несуществующий id — NotFoundError', async () => {
    await expect(
      ownName.renameSelf('507f1f77bcf86cd799439011', 'Кто-то'),
    ).rejects.toThrow('Пользователь не найден');
  });

  it('невалидный ObjectId — NotFoundError, не падение', async () => {
    await expect(ownName.renameSelf('не-objectid', 'Кто-то')).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('чужая запись не тронута', async () => {
    const a = await users.createFromTelegram({
      telegramId: 7_002,
      name: 'Ученик А',
      roles: [],
      status: 'active',
    });
    const b = await users.createFromTelegram({
      telegramId: 7_003,
      name: 'Ученик Б',
      roles: [],
      status: 'active',
    });

    await ownName.renameSelf(a.id, 'Новое имя А');

    const foundA = await users.findById(a.id);
    const foundB = await users.findById(b.id);
    expect(foundA?.name).toBe('Новое имя А');
    expect(foundB?.name).toBe('Ученик Б');
  });
});
