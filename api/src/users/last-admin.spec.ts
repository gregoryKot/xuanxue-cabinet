// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): точный
// подсчёт админов имеет значение, мок пропускает саму механику countDocuments.
import type { Model } from 'mongoose';
import { isLastAdmin } from './last-admin';
import { UserRecord, UserSchema } from './user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('isLastAdmin', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('единственный админ в базе — true', async () => {
    const admin = await model.create({ name: 'Одна', roles: ['admin'] });
    expect(await isLastAdmin(model, admin._id.toString())).toBe(true);
  });

  it('есть ещё один админ — false', async () => {
    const admin = await model.create({ name: 'Первая', roles: ['admin'] });
    await model.create({ name: 'Вторая', roles: ['admin'] });
    expect(await isLastAdmin(model, admin._id.toString())).toBe(false);
  });

  it('учитель и ученик в базе не считаются админами', async () => {
    const admin = await model.create({ name: 'Админ', roles: ['admin'] });
    await model.create({ name: 'Учитель', roles: ['teacher'] });
    await model.create({ name: 'Ученик', roles: [] });
    expect(await isLastAdmin(model, admin._id.toString())).toBe(true);
  });
});
