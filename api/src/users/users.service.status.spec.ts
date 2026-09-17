// Отдельный файл, не users.service.spec.ts (тот уже на 171 строке — лимит
// 150, растить нельзя, CLAUDE.md «Храповики»): чтение статуса вне
// USER_STATUSES через настоящую Mongo (mongodb-memory-server, не мок
// модели — CLAUDE.md «Тесты»), слой совместимости expand→contract
// (ADR-0036, normalize-user-status.ts). Документ вставлен нативным
// драйвером в обход Mongoose-валидации enum — так лежат данные, записанные
// до деплоя этой миграции/нормализации (окно деплоя, revert-PR).
import { ObjectId } from 'mongodb';
import type { Connection, Model } from 'mongoose';
import { UserRecord, UserSchema } from './user.schema';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const USERS = 'users';

describe('UsersService — статус вне USER_STATUSES (ADR-0036, expand→contract)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: UsersService;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    await model.syncIndexes();
    service = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('findById и findByTelegramId читают неизвестный статус как active, документ в базе не переписан', async () => {
    const id = new ObjectId();
    await db().collection(USERS).insertOne({
      _id: id,
      name: 'Пришёл до миграции',
      roles: [],
      status: 'invited',
      tz: 'Asia/Jerusalem',
      telegramId: 4242,
    });

    const byId = await service.findById(id.toString());
    expect(byId?.status).toBe('active');

    const byTelegramId = await service.findByTelegramId(4242);
    expect(byTelegramId?.status).toBe('active');

    // Read-only слой (CLAUDE.md «Тесты» read-after-write): чтение не должно
    // было переписать документ в базе — иначе normalize-user-status.ts
    // перестал бы быть отражением миграции 0007 и стал бы второй миграцией.
    const raw = await db().collection(USERS).findOne({ _id: id });
    expect(raw?.status).toBe('invited');
  });
});
