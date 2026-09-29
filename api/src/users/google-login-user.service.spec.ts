// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// read-after-write для findByGoogleId/createFromGoogle/attachGoogleId и
// настоящая гонка двух параллельных первых входов на реальном уникальном
// индексе googleId.
import type { Connection, Model } from 'mongoose';
import { GoogleLoginUserService } from './google-login-user.service';
import { UserRecord, UserSchema } from './user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('GoogleLoginUserService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: GoogleLoginUserService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    await model.syncIndexes();
    service = new GoogleLoginUserService(model);
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('findByGoogleId: неизвестный sub — null', async () => {
    await expect(service.findByGoogleId('нет-такого')).resolves.toBeNull();
  });

  it('createFromGoogle → findByGoogleId: read-after-write, active без ролей', async () => {
    const created = await service.createFromGoogle({ sub: 'sub-1', name: 'Анна' });
    expect(created).toMatchObject({
      googleId: 'sub-1',
      name: 'Анна',
      roles: [],
      status: 'active',
      email: undefined,
    });

    const found = await service.findByGoogleId('sub-1');
    expect(found).toMatchObject({ id: created.id, googleId: 'sub-1' });
  });

  it('createFromGoogle с email (emailAuthoritative) — email пишется', async () => {
    const created = await service.createFromGoogle({
      sub: 'sub-2',
      name: 'Анна',
      email: 'anna@gmail.com',
    });
    expect(created.email).toBe('anna@gmail.com');
  });

  it('createFromGoogle: повторный вызов тем же sub — тот же пользователь, не дубль', async () => {
    const first = await service.createFromGoogle({ sub: 'sub-3', name: 'Анна' });
    const second = await service.createFromGoogle({ sub: 'sub-3', name: 'Анна' });

    expect(second.id).toBe(first.id);
    await expect(model.countDocuments({ googleId: 'sub-3' })).resolves.toBe(1);
  });

  it('два параллельных первых createFromGoogle одним sub — один пользователь в базе', async () => {
    const [first, second] = await Promise.all([
      service.createFromGoogle({ sub: 'sub-race', name: 'Анна' }),
      service.createFromGoogle({ sub: 'sub-race', name: 'Анна' }),
    ]);

    expect(first.id).toBe(second.id);
    await expect(model.countDocuments({ googleId: 'sub-race' })).resolves.toBe(1);
  });

  it('attachGoogleId: ставит googleId на аккаунт без него', async () => {
    const doc = await model.create({
      name: 'Дима',
      email: 'dima@example.com',
      roles: [],
    });

    const attached = await service.attachGoogleId(doc._id.toString(), 'sub-4');

    expect(attached).toMatchObject({ id: doc._id.toString(), googleId: 'sub-4' });
  });

  it('attachGoogleId: у аккаунта уже есть googleId — null, гонку не выиграл', async () => {
    const doc = await model.create({
      name: 'Дима',
      email: 'dima2@example.com',
      googleId: 'sub-5',
      roles: [],
    });

    await expect(service.attachGoogleId(doc._id.toString(), 'sub-6')).resolves.toBeNull();
  });
});
