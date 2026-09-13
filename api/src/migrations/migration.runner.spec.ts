// Реальный Mongo в памяти вместо мока: раннер держит логику блокировок и
// денормализованного состояния (какие миграции применены), read-after-write
// связка «применил → записалось → второй прогон не повторяет» важнее мока.
import type { Db } from 'mongodb';
import type { Connection } from 'mongoose';
import { MigrationRunner } from './migration.runner';
import type { Migration } from './migrations';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// Точечный доступ к приватным `acquireLock`/`releaseLock` — единственный
// способ детерминированно (без сети и без гонки в реальном времени)
// проиграть сценарий M1 «Б перехватил замок раньше, чем А успел его снять».
interface RunnerLockInternals {
  acquireLock: (db: Db) => Promise<boolean>;
  releaseLock: (db: Db) => Promise<void>;
}

// Та же форма документа, что и в migration.runner.ts (id — строка, не
// ObjectId по умолчанию) — иначе driver-типы mongodb требуют ObjectId для `_id`.
interface MigrationsDoc {
  _id: string;
  appliedAt?: Date;
  expiresAt?: Date;
  ownerId?: string;
}

describe('MigrationRunner', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let runner: MigrationRunner;

  function db(): Db {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  function collection() {
    return db().collection<MigrationsDoc>('migrations');
  }

  function lockInternalsOf(target: MigrationRunner): RunnerLockInternals {
    return target as unknown as RunnerLockInternals;
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

  // Аудит M1: инстанс А держал замок дольше TTL, инстанс Б перехватил его —
  // `releaseLock` инстанса А не должен снимать замок, который теперь чужой.
  it('releaseLock не удаляет замок, перехваченный другим инстансом', async () => {
    const runnerA = new MigrationRunner(connection);
    const runnerB = new MigrationRunner(connection);
    await collection().insertOne({
      _id: '__lock',
      ownerId: 'runner-a-before-restart',
      expiresAt: new Date(Date.now() - 1_000),
    });

    const acquiredByB = await lockInternalsOf(runnerB).acquireLock(db());
    expect(acquiredByB).toBe(true);
    const lockAfterTakeover = await collection().findOne({ _id: '__lock' });

    await lockInternalsOf(runnerA).releaseLock(db());

    const lockAfterStaleRelease = await collection().findOne({ _id: '__lock' });
    expect(lockAfterStaleRelease?.ownerId).toBe(lockAfterTakeover?.ownerId);
    expect(lockAfterStaleRelease).not.toBeNull();
  });

  // Аудит M1: два инстанса перехватывают замок и оба доходят до записи
  // «применена» — второй `insertOne` падает E11000, это не должно ронять run().
  it('дубликат записи о применении не роняет run(), только предупреждает', async () => {
    const migrations: Migration[] = [
      {
        id: '0001-concurrent',
        up: async (migrationDb) => {
          // Имитация конкурента: он уже записал факт применения этой же
          // миграции к моменту, когда текущий инстанс дошёл до `up()`.
          await migrationDb.collection<MigrationsDoc>('migrations').insertOne({
            _id: '0001-concurrent',
            appliedAt: new Date(),
          });
        },
      },
    ];

    await expect(runner.run(migrations)).resolves.toBeUndefined();
    expect(await appliedIds()).toEqual(['0001-concurrent']);
  });

  it('без установленного соединения с БД бросает понятную ошибку', async () => {
    const brokenConnection = { db: undefined } as unknown as Connection;
    const brokenRunner = new MigrationRunner(brokenConnection);

    await expect(brokenRunner.run([])).rejects.toThrow(/соединение/);
  });
});
