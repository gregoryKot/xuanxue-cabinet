// Реальный Mongo вместо мока моделей: syncIndexes() и правда создаёт индекс
// в базе — мок метода доказал бы только то, что мы его вызвали.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Schema, type Connection } from 'mongoose';
import { IndexSyncService } from './index-sync.service';

describe('IndexSyncService', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongod.getUri()).asPromise();
  }, 60_000);

  afterAll(async () => {
    await connection.close();
    await mongod.stop();
  });

  it('строит индексы для зарегистрированных моделей', async () => {
    const schema = new Schema({ email: { type: String, unique: true } });
    connection.model('TestUnique', schema);

    await new IndexSyncService(connection).run();

    const indexes = await connection.model('TestUnique').collection.indexes();
    expect(indexes.some((i) => i.unique)).toBe(true);
  });

  it('ошибка одной модели логируется, остальные строятся, run() бросает', async () => {
    const okModel = connection.model('TestOk', new Schema({ name: String }));
    const brokenModel = connection.model('TestBroken', new Schema({ x: String }));
    const syncSpy = jest.spyOn(okModel, 'syncIndexes');
    jest.spyOn(brokenModel, 'syncIndexes').mockRejectedValueOnce(new Error('boom'));

    await expect(new IndexSyncService(connection).run()).rejects.toThrow('TestBroken');

    expect(syncSpy).toHaveBeenCalled();
  });
});
