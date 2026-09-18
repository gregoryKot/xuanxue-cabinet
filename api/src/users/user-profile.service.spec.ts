// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): образец — user-status.service.spec.ts (та же пара NotFoundError
// на невалидный/несуществующий id) и user-names.service.spec.ts. Read-after-
// write — отдельно через UsersService.findById, а не только возврат setName.
import { DateTime } from 'luxon';
import { UserRecord, UserSchema } from './user.schema';
import { UserProfileService } from './user-profile.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-18T10:00:00Z');

describe('UserProfileService.setName', () => {
  let memory: MemoryMongo;
  let profile: UserProfileService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    const model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    profile = new UserProfileService(model);
    users = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('невалидный ObjectId — NotFoundError, не падение', async () => {
    await expect(
      profile.setName('не-objectid', { firstName: 'Аня' }, NOW),
    ).rejects.toThrow('Пользователь не найден');
  });

  it('несуществующий валидный id — NotFoundError', async () => {
    await expect(
      profile.setName('507f1f77bcf86cd799439011', { firstName: 'Аня' }, NOW),
    ).rejects.toThrow('Пользователь не найден');
  });

  it('пишет склеенное имя и profileNamedAt, видно при read-after-write через UsersService', async () => {
    const created = await users.createFromTelegram({
      telegramId: 9001,
      name: 'Новый ученик',
      roles: [],
      status: 'active',
    });

    const updated = await profile.setName(
      created.id,
      { firstName: 'Анна', lastName: 'Петрова' },
      NOW,
    );
    expect(updated.name).toBe('Анна Петрова');
    expect(updated.profileNamedAt).toEqual(NOW.toJSDate());

    const found = await users.findById(created.id);
    expect(found?.name).toBe('Анна Петрова');
    expect(found?.profileNamedAt).toEqual(NOW.toJSDate());
  });

  it('без фамилии — name состоит только из имени (joinPersonName отбрасывает пустую фамилию)', async () => {
    const created = await users.createFromTelegram({
      telegramId: 9002,
      name: 'Новый ученик',
      roles: [],
      status: 'active',
    });

    const updated = await profile.setName(created.id, { firstName: 'Борис' }, NOW);

    expect(updated.name).toBe('Борис');
  });

  it('пустая строка в фамилии — тот же результат, что без неё (человек стирает фамилию)', async () => {
    const created = await users.createFromTelegram({
      telegramId: 9003,
      name: 'Борис Петров',
      roles: [],
      status: 'active',
    });

    const updated = await profile.setName(
      created.id,
      { firstName: 'Борис', lastName: '' },
      NOW,
    );

    expect(updated.name).toBe('Борис');
  });
});
