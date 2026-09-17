// Раннер миграций Mongo — правило CLAUDE.md «Миграции БД», унаследованное из
// инцидента telegram-bot-2 2026-07-16: битая миграция не должна поднимать
// приложение на кривых данных, лучше не стартовать вовсе. Запускается через
// OnApplicationBootstrap — этот хук у Nest всегда отрабатывает раньше, чем
// HTTP-сервер начинает слушать порт (и в проде, и в `app.init()` под e2e).
import { randomUUID } from 'crypto';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Db } from 'mongodb';
import type { Connection } from 'mongoose';
import { MIGRATIONS, type Migration } from './migrations';
import { isDuplicateKeyError } from '../common/mongo-error-codes';

const COLLECTION = 'migrations';
const LOCK_ID = '__lock';
const LOCK_TTL_MINUTES = 10;

// Один документ в коллекции `migrations` — либо запись о применённой
// миграции (appliedAt), либо замок (expiresAt, ownerId). Общая коллекция,
// общая форма. `ownerId` — аудит M1: без владельца TTL-перехват одним
// инстансом оставлял `releaseLock` другого безусловным, и тот в `finally`
// удалял уже чужой действующий замок.
interface MigrationsDoc {
  _id: string;
  appliedAt?: Date;
  expiresAt?: Date;
  ownerId?: string;
}

@Injectable()
export class MigrationRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationRunner.name);
  // Случайный на каждый инстанс раннера — не на процесс: в e2e и тестах один
  // процесс создаёт несколько `MigrationRunner`, и им нужны разные владельцы
  // (аудит M1).
  private readonly ownerId = randomUUID();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  async run(migrations: Migration[] = MIGRATIONS): Promise<void> {
    const db = this.connection.db;
    if (!db) {
      throw new Error('MigrationRunner: соединение с MongoDB ещё не установлено');
    }

    const acquired = await this.acquireLock(db);
    if (!acquired) {
      this.logger.warn('Миграции пропущены: замок уже держит другой инстанс');
      return;
    }
    try {
      await this.applyPending(db, migrations);
    } finally {
      await this.releaseLock(db);
    }
  }

  private collection(db: Db) {
    return db.collection<MigrationsDoc>(COLLECTION);
  }

  // Замок — документ `_id: '__lock'` в той же коллекции. Уникальность `_id`
  // защищает от гонки двух инстансов; TTL страхует от замка, оставшегося
  // висеть после падения процесса без release. `ownerId` пишется вместе с
  // перехватом, чтобы `releaseLock` мог отличить свой замок от чужого (M1).
  private async acquireLock(db: Db): Promise<boolean> {
    const now = DateTime.utc().toJSDate();
    const expiresAt = DateTime.utc().plus({ minutes: LOCK_TTL_MINUTES }).toJSDate();
    try {
      await this.collection(db).insertOne({
        _id: LOCK_ID,
        ownerId: this.ownerId,
        expiresAt,
      });
      return true;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const takenOverExpired = await this.collection(db).findOneAndUpdate(
        { _id: LOCK_ID, expiresAt: { $lt: now } },
        { $set: { ownerId: this.ownerId, expiresAt } },
      );
      return takenOverExpired != null;
    }
  }

  // Условие по `ownerId` — суть фикса M1: без него инстанс, чей замок уже
  // перехватили по истечении TTL, удалял здесь чужой действующий замок.
  // Ноль удалённых документов — не ошибка процесса, просто чужая победа.
  private async releaseLock(db: Db): Promise<void> {
    const result = await this.collection(db).deleteOne({
      _id: LOCK_ID,
      ownerId: this.ownerId,
    });
    if (result.deletedCount === 0) {
      this.logger.warn('Замок миграций уже перехвачен другим инстансом');
    }
  }

  private async applyPending(db: Db, migrations: Migration[]): Promise<void> {
    const collection = this.collection(db);
    const appliedDocs = await collection.find({ appliedAt: { $exists: true } }).toArray();
    const applied = new Set(appliedDocs.map((doc) => doc._id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      this.logger.log(`Применяю миграцию ${migration.id}`);
      await migration.up(db);
      await this.recordApplied(collection, migration.id);
    }
  }

  // `up()` идемпотентна по правилу CLAUDE.md, поэтому дубликат записи о
  // применении (M1: два инстанса перехватили замок и оба прошли до записи)
  // не сигнал повреждения данных — сигнал того, что миграцию уже применил
  // конкурент; повторный `up()` для проигравшего безвреден, перечитывать
  // список применённых перед каждым `up()` не нужно.
  private async recordApplied(
    collection: ReturnType<MigrationRunner['collection']>,
    migrationId: string,
  ): Promise<void> {
    try {
      await collection.insertOne({
        _id: migrationId,
        appliedAt: DateTime.utc().toJSDate(),
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      this.logger.warn(`Миграция ${migrationId} уже применена другим инстансом`);
    }
  }
}
