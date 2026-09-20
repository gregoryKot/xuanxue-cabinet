// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): образец — user-profile.service.spec.ts (та же пара NotFoundError
// на невалидный/несуществующий id). Read-after-write — отдельно через
// UsersService.findById, а не только возврат setNoTelegram.
import { DateTime } from 'luxon';
import { UserRecord, UserSchema } from './user.schema';
import { UserNoTelegramService } from './user-no-telegram.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-20T10:00:00Z');
const LATER = DateTime.fromISO('2026-09-21T11:00:00Z');

describe('UserNoTelegramService.setNoTelegram', () => {
  let memory: MemoryMongo;
  let noTelegram: UserNoTelegramService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    const model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    noTelegram = new UserNoTelegramService(model);
    users = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('невалидный ObjectId — NotFoundError, не падение', async () => {
    await expect(noTelegram.setNoTelegram('не-objectid', true, NOW)).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('несуществующий валидный id — NotFoundError', async () => {
    await expect(
      noTelegram.setNoTelegram('507f1f77bcf86cd799439011', true, NOW),
    ).rejects.toThrow('Пользователь не найден');
  });

  it('true пишет noTelegramAt, видно при read-after-write через UsersService', async () => {
    const created = await users.createFromTelegram({
      telegramId: 9101,
      name: 'Ученик без Telegram',
      roles: [],
      status: 'active',
    });

    const updated = await noTelegram.setNoTelegram(created.id, true, NOW);
    expect(updated.noTelegramAt).toEqual(NOW.toJSDate());

    const found = await users.findById(created.id);
    expect(found?.noTelegramAt).toEqual(NOW.toJSDate());
  });

  // Главный кейс: человек завёл Telegram позже, кабинет обязан снова
  // предложить связку — снятая отметка обязана реально исчезнуть ($unset),
  // а не превратиться в null, иначе auth/user.mapper.ts (noTelegramAt !=
  // null) по-прежнему читал бы её как «отметка есть».
  it('false снимает noTelegramAt, read-after-write подтверждает возврат предложения', async () => {
    const created = await users.createFromTelegram({
      telegramId: 9102,
      name: 'Завёл Telegram позже',
      roles: [],
      status: 'active',
    });
    await noTelegram.setNoTelegram(created.id, true, NOW);

    const updated = await noTelegram.setNoTelegram(created.id, false, LATER);
    expect(updated.noTelegramAt).toBeUndefined();

    const found = await users.findById(created.id);
    expect(found?.noTelegramAt).toBeUndefined();
  });

  it('повторный true с другим now — отметка остаётся, момент обновляется', async () => {
    const created = await users.createFromTelegram({
      telegramId: 9103,
      name: 'Повторная отметка',
      roles: [],
      status: 'active',
    });
    await noTelegram.setNoTelegram(created.id, true, NOW);

    const updated = await noTelegram.setNoTelegram(created.id, true, LATER);
    expect(updated.noTelegramAt).toEqual(LATER.toJSDate());

    const found = await users.findById(created.id);
    expect(found?.noTelegramAt).toEqual(LATER.toJSDate());
  });
});
