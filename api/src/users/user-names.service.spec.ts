// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): имена по id пачкой, пустой вход, несуществующий и невалидный id.
import type { Connection, Model } from 'mongoose';
import { UserRecord, UserSchema } from './user.schema';
import { UserNamesService } from './user-names.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('UserNamesService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: UserNamesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new UserNamesService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('пустой вход — пустая Map без обращения к базе', async () => {
    const spy = jest.spyOn(model, 'find');

    const names = await service.namesByIds([]);

    expect(names.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('находит имена по id одним запросом', async () => {
    const a = await model.create({ name: 'Дима', roles: ['teacher'], status: 'active' });
    const b = await model.create({ name: 'Маша', roles: [], status: 'active' });

    const names = await service.namesByIds([a._id.toString(), b._id.toString()]);

    expect(names.get(a._id.toString())).toBe('Дима');
    expect(names.get(b._id.toString())).toBe('Маша');
    expect(names.size).toBe(2);
  });

  it('несуществующий валидный id — просто отсутствует в Map', async () => {
    const missingId = '507f1f77bcf86cd799439011';

    const names = await service.namesByIds([missingId]);

    expect(names.has(missingId)).toBe(false);
  });

  it('невалидный ObjectId отсеивается, не улетает в запрос', async () => {
    const created = await model.create({ name: 'Ученик', roles: [], status: 'active' });

    const names = await service.namesByIds(['не-id', created._id.toString()]);

    expect(names.size).toBe(1);
    expect(names.get(created._id.toString())).toBe('Ученик');
  });
});
