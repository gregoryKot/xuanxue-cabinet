// Общий подъём Mongo в памяти для тестов, которым нужна настоящая база
// (CLAUDE.md «Тесты»: запросы к базе — против реальной Mongo, не мока).
// Три спека поднимали mongod + connection одинаковым кодом — вынесено сюда,
// чтобы повторяющийся блок не плодил дубли (CLAUDE.md «Храповики», jscpd).
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';

export interface MemoryMongo {
  connection: Connection;
  stop(): Promise<void>;
}

/** Поднимает MongoMemoryServer и открытое соединение Mongoose к нему.
 * `stop()` закрывает оба в правильном порядке — вызывать в `afterAll`. */
export async function openMemoryMongo(): Promise<MemoryMongo> {
  const mongod = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(mongod.getUri()).asPromise();

  return {
    connection,
    async stop() {
      await connection.close();
      await mongod.stop();
    },
  };
}
