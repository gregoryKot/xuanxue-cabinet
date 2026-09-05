// Раннер миграций Mongo — правило CLAUDE.md «Миграции БД», унаследованное из
// инцидента telegram-bot-2 2026-07-16: битая миграция не должна поднимать
// приложение на кривых данных, лучше не стартовать вовсе. Запускается через
// OnApplicationBootstrap — этот хук у Nest всегда отрабатывает раньше, чем
// HTTP-сервер начинает слушать порт (и в проде, и в `app.init()` под e2e).
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Db } from 'mongodb';
import type { Connection } from 'mongoose';
import { MIGRATIONS, type Migration } from './migrations';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';

const COLLECTION = 'migrations';
const LOCK_ID = '__lock';
const LOCK_TTL_MINUTES = 10;

// Один документ в коллекции `migrations` — либо запись о применённой
// миграции (appliedAt), либо замок (expiresAt). Общая коллекция, общая форма.
interface MigrationsDoc {
  _id: string;
  appliedAt?: Date;
  expiresAt?: Date;
}

@Injectable()
export class MigrationRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationRunner.name);

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
  // висеть после падения процесса без release.
  private async acquireLock(db: Db): Promise<boolean> {
    const now = DateTime.utc().toJSDate();
    const expiresAt = DateTime.utc().plus({ minutes: LOCK_TTL_MINUTES }).toJSDate();
    try {
      await this.collection(db).insertOne({ _id: LOCK_ID, expiresAt });
      return true;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const takenOverExpired = await this.collection(db).findOneAndUpdate(
        { _id: LOCK_ID, expiresAt: { $lt: now } },
        { $set: { expiresAt } },
      );
      return takenOverExpired != null;
    }
  }

  private async releaseLock(db: Db): Promise<void> {
    await this.collection(db).deleteOne({ _id: LOCK_ID });
  }

  private async applyPending(db: Db, migrations: Migration[]): Promise<void> {
    const collection = this.collection(db);
    const appliedDocs = await collection.find({ appliedAt: { $exists: true } }).toArray();
    const applied = new Set(appliedDocs.map((doc) => doc._id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      this.logger.log(`Применяю миграцию ${migration.id}`);
      await migration.up(db);
      await collection.insertOne({
        _id: migration.id,
        appliedAt: DateTime.utc().toJSDate(),
      });
    }
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE
  );
}
