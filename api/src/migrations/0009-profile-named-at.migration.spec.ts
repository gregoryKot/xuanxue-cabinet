// Миграция трогает профиль реальных людей — проверяем на настоящей Mongo
// (образец: 0007-invited-users-active.migration.spec.ts). Пишем документы
// напрямую нативным драйвером, не через Mongoose .create(): миграция обязана
// отработать на данных, которые реально лежат в проде до деплоя, не на том,
// что после contract-шага пропустит валидация схемы.
import { mongo, type Connection } from 'mongoose';
import { profileNamedAt } from './0009-profile-named-at.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому `ObjectId` — тот же
// класс, что и внутри mongoose, без второй копии пакета `mongodb`.
const { ObjectId } = mongo;
const USERS = 'users';

interface RawUser {
  name: string;
  email?: string;
  createdAt: Date;
  profileNamedAt?: Date;
}

describe('Миграция 0009-profile-named-at', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createUser(fields: RawUser): Promise<string> {
    const id = new ObjectId();
    await db()
      .collection(USERS)
      .insertOne({ _id: id, roles: [], status: 'active', ...fields });
    return id.toString();
  }

  async function profileNamedAtOf(id: string): Promise<Date | undefined> {
    const doc = await db()
      .collection(USERS)
      .findOne({ _id: new ObjectId(id) });
    return doc?.profileNamedAt as Date | undefined;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await db().collection(USERS).deleteMany({});
  });

  it('имя из Telegram (email не задан) — получает profileNamedAt = createdAt', async () => {
    const createdAt = new Date('2026-01-10T00:00:00Z');
    const id = await createUser({ name: 'Дима Учитель', createdAt });

    await profileNamedAt.up(db());

    expect((await profileNamedAtOf(id))?.toISOString()).toBe(createdAt.toISOString());
  });

  it('имя равно email (старый вход по почте) — не получает ничего', async () => {
    const id = await createUser({
      name: 'dima@example.com',
      email: 'dima@example.com',
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });

    await profileNamedAt.up(db());

    expect(await profileNamedAtOf(id)).toBeUndefined();
  });

  it('имя настоящее, email тоже задан, но они не совпадают — получает createdAt', async () => {
    const createdAt = new Date('2026-02-01T00:00:00Z');
    const id = await createUser({
      name: 'Маша',
      email: 'masha@example.com',
      createdAt,
    });

    await profileNamedAt.up(db());

    expect((await profileNamedAtOf(id))?.toISOString()).toBe(createdAt.toISOString());
  });

  it('уже проставленное — не перезаписывается', async () => {
    const already = new Date('2025-05-01T00:00:00Z');
    const id = await createUser({
      name: 'Борис',
      createdAt: new Date('2026-01-10T00:00:00Z'),
      profileNamedAt: already,
    });

    await profileNamedAt.up(db());

    expect((await profileNamedAtOf(id))?.toISOString()).toBe(already.toISOString());
  });

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    const createdAt = new Date('2026-01-10T00:00:00Z');
    const id = await createUser({ name: 'Дима Учитель', createdAt });

    await profileNamedAt.up(db());
    await profileNamedAt.up(db());

    expect((await profileNamedAtOf(id))?.toISOString()).toBe(createdAt.toISOString());
  });

  it('пустая база молчит', async () => {
    await expect(profileNamedAt.up(db())).resolves.toBeUndefined();

    expect(await db().collection(USERS).countDocuments()).toBe(0);
  });
});
