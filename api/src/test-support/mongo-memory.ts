// Общий подъём Mongo в памяти для тестов, которым нужна настоящая база
// (CLAUDE.md «Тесты»: запросы к базе — против реальной Mongo, не мока).
// Три спека поднимали mongod + connection одинаковым кодом — вынесено сюда,
// чтобы повторяющийся блок не плодил дубли (CLAUDE.md «Храповики», jscpd).
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';
import { MODEL_DEFINITIONS } from '../common/model.registry';

export interface MemoryMongo {
  connection: Connection;
  stop(): Promise<void>;
}

/** Поднимает MongoMemoryServer и открытое соединение Mongoose к нему, с уже
 * построенными индексами всех моделей из реестра: Mongoose строит индексы в
 * фоне после компиляции модели, и спек, который опирается на уникальный
 * индекс (гонка двух тиков, дубль канала), без этого мигал — успевал вставить
 * два документа до появления индекса (инцидент users.service.spec, PR #19,
 * повторился в broadcast-planner.service.spec). Спеки берут модели через
 * `connection.model(Name)` — та же схема, повторная регистрация не нужна.
 * `stop()` закрывает соединение и mongod в правильном порядке — в `afterAll`. */
export async function openMemoryMongo(): Promise<MemoryMongo> {
  const mongod = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(mongod.getUri()).asPromise();
  await Promise.all(
    MODEL_DEFINITIONS.map(({ name, schema }) =>
      connection.model(name, schema).syncIndexes(),
    ),
  );

  return {
    connection,
    async stop() {
      await connection.close();
      await mongod.stop();
    },
  };
}
