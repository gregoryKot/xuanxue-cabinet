// Миграция трогает профиль реальных людей — проверяем на настоящей Mongo
// (образец: 0009-profile-named-at.migration.spec.ts). Пишем документы
// напрямую нативным драйвером, не через Mongoose .create(): миграция обязана
// отработать на данных, которые реально лежат в проде до деплоя, а схема
// после contract-шага поля `tz` уже не знает и записать его не даст.
import { mongo, type Connection } from 'mongoose';
import { dropUserTz } from './0010-drop-user-tz.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому `ObjectId` — тот же
// класс, что и внутри mongoose, без второй копии пакета `mongodb`.
const { ObjectId } = mongo;
const USERS = 'users';

describe('Миграция 0010-drop-user-tz', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createUser(fields: Record<string, unknown>): Promise<string> {
    const id = new ObjectId();
    await db()
      .collection(USERS)
      .insertOne({ _id: id, name: 'Маша', roles: [], status: 'active', ...fields });
    return id.toString();
  }

  async function rawUser(id: string): Promise<Record<string, unknown>> {
    const doc = await db()
      .collection(USERS)
      .findOne({ _id: new ObjectId(id) });
    if (!doc) throw new Error(`пользователь ${id} не найден`);
    return doc;
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

  it('пояс школы снимается', async () => {
    const id = await createUser({ tz: 'Asia/Jerusalem' });

    await dropUserTz.up(db());

    expect('tz' in (await rawUser(id))).toBe(false);
  });

  it('снимается и пояс, отличный от школьного, — поле уходит целиком', async () => {
    const id = await createUser({ tz: 'Europe/Berlin' });

    await dropUserTz.up(db());

    expect('tz' in (await rawUser(id))).toBe(false);
  });

  it('остальные поля профиля остаются нетронутыми', async () => {
    const id = await createUser({
      tz: 'Asia/Jerusalem',
      name: 'Дима Учитель',
      email: 'dima@example.com',
      roles: ['teacher'],
    });

    await dropUserTz.up(db());

    const doc = await rawUser(id);
    expect(doc.name).toBe('Дима Учитель');
    expect(doc.email).toBe('dima@example.com');
    expect(doc.roles).toEqual(['teacher']);
    expect(doc.status).toBe('active');
  });

  it('документ без пояса не ломается', async () => {
    const id = await createUser({});

    await expect(dropUserTz.up(db())).resolves.toBeUndefined();

    expect('tz' in (await rawUser(id))).toBe(false);
  });

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    const id = await createUser({ tz: 'Asia/Jerusalem' });

    await dropUserTz.up(db());
    await dropUserTz.up(db());

    expect('tz' in (await rawUser(id))).toBe(false);
  });

  it('пустая база молчит', async () => {
    await expect(dropUserTz.up(db())).resolves.toBeUndefined();

    expect(await db().collection(USERS).countDocuments()).toBe(0);
  });
});
