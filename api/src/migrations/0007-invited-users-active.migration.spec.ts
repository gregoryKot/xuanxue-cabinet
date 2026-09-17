// Миграция трогает статус входа реальных людей — проверяем на настоящей
// Mongo (образец: 0006-…spec.ts): invited становится active, остальные
// статусы не трогает, второй запуск ничего не портит, пустая база молчит.
// Пишем документы напрямую нативным драйвером (db().collection(...)), не
// через Mongoose .create(): схема больше не принимает 'invited' в enum
// status (contract после этого PR), а миграция должна отработать на
// данных, которые реально лежат в проде до деплоя — Mongoose со своей
// валидацией здесь мимо.
import type { Connection } from 'mongoose';
import { ObjectId } from 'mongodb';
import { invitedUsersActive } from './0007-invited-users-active.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const USERS = 'users';

describe('Миграция 0007-invited-users-active', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createUser(name: string, status: string): Promise<string> {
    const id = new ObjectId();
    await db().collection(USERS).insertOne({ _id: id, name, roles: [], status });
    return id.toString();
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const doc = await db()
      .collection(USERS)
      .findOne({ _id: new ObjectId(id) });
    return doc?.status as string | undefined;
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

  it('invited становится active', async () => {
    const id = await createUser('Ждёт подтверждения', 'invited');

    await invitedUsersActive.up(db());

    expect(await statusOf(id)).toBe('active');
  });

  it('active и blocked не трогает', async () => {
    const active = await createUser('Уже в кабинете', 'active');
    const blocked = await createUser('Заблокирован', 'blocked');

    await invitedUsersActive.up(db());

    expect(await statusOf(active)).toBe('active');
    expect(await statusOf(blocked)).toBe('blocked');
  });

  it('повторный запуск ничего не меняет', async () => {
    const id = await createUser('Ждёт подтверждения', 'invited');

    await invitedUsersActive.up(db());
    await invitedUsersActive.up(db());

    expect(await statusOf(id)).toBe('active');
  });

  it('пользователей нет — миграция молчит, приложение стартует', async () => {
    await expect(invitedUsersActive.up(db())).resolves.toBeUndefined();

    expect(await db().collection(USERS).countDocuments()).toBe(0);
  });
});
