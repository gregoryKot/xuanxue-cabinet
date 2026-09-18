// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// read-after-write для findByEmail/createFromEmail и настоящая гонка двух
// параллельных первых переходов по одной ссылке на реальном уникальном
// индексе email (не симуляция — та уже есть в users.service.race.spec.ts
// для Telegram, здесь общий upsertUserByKey проверяется вторым путём).
import type { Connection, Model } from 'mongoose';
import { NEW_PERSON_NAME } from '@xuanxue/shared';
import { EmailLoginUserService } from './email-login-user.service';
import { UserRecord, UserSchema } from './user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('EmailLoginUserService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: EmailLoginUserService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    await model.syncIndexes();
    service = new EmailLoginUserService(model);
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('findByEmail: неизвестный email — null', async () => {
    await expect(service.findByEmail('нет@example.com')).resolves.toBeNull();
  });

  it('createFromEmail → findByEmail: read-after-write, active без ролей, имя — заглушка', async () => {
    const created = await service.createFromEmail('dima@example.com');
    expect(created).toMatchObject({
      email: 'dima@example.com',
      // Заглушка, не сам email (SECURITY §1, ADR-0044) — иначе адрес почты
      // утекает в список «Ученики» и в приветствие.
      name: NEW_PERSON_NAME,
      roles: [],
      status: 'active',
    });

    const found = await service.findByEmail('dima@example.com');
    expect(found).toMatchObject({ id: created.id, email: 'dima@example.com' });
  });

  it('createFromEmail: повторный вызов тем же email — тот же пользователь, не дубль', async () => {
    const first = await service.createFromEmail('masha@example.com');
    const second = await service.createFromEmail('masha@example.com');

    expect(second.id).toBe(first.id);
    await expect(model.countDocuments({ email: 'masha@example.com' })).resolves.toBe(1);
  });

  it('два параллельных первых createFromEmail одним адресом — один пользователь в базе', async () => {
    const [first, second] = await Promise.all([
      service.createFromEmail('race@example.com'),
      service.createFromEmail('race@example.com'),
    ]);

    expect(first.id).toBe(second.id);
    await expect(model.countDocuments({ email: 'race@example.com' })).resolves.toBe(1);
  });
});
