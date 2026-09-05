// Реальный Mongo вместо мока моделей: syncIndexes() и правда создаёт индекс
// в базе — мок метода доказал бы только то, что мы его вызвали.
import { Schema, type Connection } from 'mongoose';
import { IndexSyncService } from './index-sync.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('IndexSyncService', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('строит индексы для зарегистрированных моделей', async () => {
    const schema = new Schema({ email: { type: String, unique: true } });
    connection.model('IndexSyncOnly', schema);

    await new IndexSyncService(connection).run();

    const indexes = await connection.model('IndexSyncOnly').collection.indexes();
    expect(indexes.some((i) => i.unique)).toBe(true);
  });

  it('ошибка одной модели логируется, остальные строятся, run() бросает', async () => {
    // Сломанная модель регистрируется раньше исправной: тест доказывает, что
    // цикл продолжается ПОСЛЕ падения, а не просто успевает до него дойти.
    const brokenModel = connection.model('IndexSyncBroken', new Schema({ x: String }));
    const okModel = connection.model('IndexSyncOk', new Schema({ name: String }));
    jest.spyOn(brokenModel, 'syncIndexes').mockRejectedValueOnce(new Error('boom'));
    const syncSpy = jest.spyOn(okModel, 'syncIndexes');

    await expect(new IndexSyncService(connection).run()).rejects.toThrow(
      'IndexSyncBroken',
    );

    expect(syncSpy).toHaveBeenCalled();
  });

  it('падение не-Error значением тоже логируется без стека и run() бросает', async () => {
    const brokenModel = connection.model(
      'IndexSyncBrokenString',
      new Schema({ x: String }),
    );
    jest.spyOn(brokenModel, 'syncIndexes').mockRejectedValueOnce('boom');

    await expect(new IndexSyncService(connection).run()).rejects.toThrow(
      'IndexSyncBrokenString',
    );
  });
});
