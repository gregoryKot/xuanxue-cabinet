// Реальный Mongo в памяти вместо мока: раннер держит логику блокировок и
// денормализованного состояния (какие миграции применены), read-after-write
// связка «применил → записалось → второй прогон не повторяет» важнее мока.
import type { Connection } from 'mongoose';
import { MigrationRunner } from './migration.runner';
import type { Migration } from './migrations';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// Та же форма документа, что и в migration.runner.ts (id — строка, не
// ObjectId по умолчанию) — иначе driver-типы mongodb требуют ObjectId для `_id`.
interface MigrationsDoc {
  _id: string;
  appliedAt?: Date;
  expiresAt?: Date;
}

describe('MigrationRunner', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let runner: MigrationRunner;

  function collection() {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db.collection<MigrationsDoc>('migrations');
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await connection.db?.collection('migrations').deleteMany({});
    runner = new MigrationRunner(connection);
  });

  async function appliedIds(): Promise<string[]> {
    const docs = await collection()
      .find({ appliedAt: { $exists: true } })
      .toArray();
    return docs.map((doc) => doc._id).sort();
  }

  it('применяет миграции по порядку и записывает каждую', async () => {
    const order: string[] = [];
    const migrations: Migration[] = [
      {
        id: '0001-init',
        up: () => {
          order.push('0001-init');
          return Promise.resolve();
        },
      },
      {
        id: '0002-second',
        up: () => {
          order.push('0002-second');
          return Promise.resolve();
        },
      },
    ];

    await runner.run(migrations);

    expect(order).toEqual(['0001-init', '0002-second']);
    expect(await appliedIds()).toEqual(['0001-init', '0002-second']);
  });

  it('второй прогон не применяет уже применённые миграции повторно', async () => {
    const up = jest.fn().mockResolvedValue(undefined);
    const migrations: Migration[] = [{ id: '0001-init', up }];

    await runner.run(migrations);
    await runner.run(migrations);

    expect(up).toHaveBeenCalledTimes(1);
  });

  it('падение второй миграции: первая записана, вторая нет, run() бросает', async () => {
    const migrations: Migration[] = [
      { id: '0001-init', up: () => Promise.resolve() },
      {
        id: '0002-broken',
        up: () => {
          throw new Error('boom: NOT NULL без DEFAULT');
        },
      },
    ];

    await expect(runner.run(migrations)).rejects.toThrow('boom');
    expect(await appliedIds()).toEqual(['0001-init']);
  });

  it('занятый (не истёкший) замок — прогон пропускается, миграции не применяются', async () => {
    await collection().insertOne({
      _id: '__lock',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const up = jest.fn().mockResolvedValue(undefined);

    await runner.run([{ id: '0001-init', up }]);

    expect(up).not.toHaveBeenCalled();
  });

  it('истёкший замок перехватывается — миграции применяются', async () => {
    await collection().insertOne({
      _id: '__lock',
      expiresAt: new Date(Date.now() - 1_000),
    });
    const up = jest.fn().mockResolvedValue(undefined);

    await runner.run([{ id: '0001-init', up }]);

    expect(up).toHaveBeenCalledTimes(1);
  });

  it('замок снимается после успешного и после упавшего прогона', async () => {
    await runner.run([{ id: '0001-init', up: () => Promise.resolve() }]);
    const lockAfterSuccess = await collection().findOne({ _id: '__lock' });
    expect(lockAfterSuccess).toBeNull();

    await expect(
      runner.run([
        {
          id: '0002-broken',
          up: () => {
            throw new Error('boom');
          },
        },
      ]),
    ).rejects.toThrow();
    const lockAfterFailure = await collection().findOne({ _id: '__lock' });
    expect(lockAfterFailure).toBeNull();
  });

  it('без установленного соединения с БД бросает понятную ошибку', async () => {
    const brokenConnection = { db: undefined } as unknown as Connection;
    const brokenRunner = new MigrationRunner(brokenConnection);

    await expect(brokenRunner.run([])).rejects.toThrow(/соединение/);
  });
});
