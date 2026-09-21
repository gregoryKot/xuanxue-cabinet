// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): confirmEmail держится на частичном уникальном индексе email
// (user.schema.ts) — гонку нужно ловить как настоящий E11000, не симулировать.
import type { Model } from 'mongoose';
import { UserEmailService } from './user-email.service';
import { UserRecord, UserSchema } from './user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('UserEmailService', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;
  let service: UserEmailService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new UserEmailService(model);
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  async function createUser(fields: Partial<UserRecord> = {}): Promise<string> {
    const doc = await model.create({ name: 'Ученик', roles: [], ...fields });
    return doc._id.toString();
  }

  describe('isEmailTaken', () => {
    it('нет пользователя с таким подтверждённым email — false', async () => {
      await expect(service.isEmailTaken('free@example.com')).resolves.toBe(false);
    });

    it('есть пользователь с подтверждённым email — true', async () => {
      await createUser({ email: 'taken@example.com' });

      await expect(service.isEmailTaken('taken@example.com')).resolves.toBe(true);
    });

    it('адрес только как pendingEmail (не подтверждён) — false', async () => {
      await createUser({ pendingEmail: 'pending@example.com' });

      await expect(service.isEmailTaken('pending@example.com')).resolves.toBe(false);
    });
  });

  describe('setPendingEmail', () => {
    it('записывает pendingEmail, отдаёт свежего UserLean (read-after-write)', async () => {
      const userId = await createUser();

      const updated = await service.setPendingEmail(userId, 'new@example.com');
      expect(updated.pendingEmail).toBe('new@example.com');

      const doc = await model.findById(userId).lean<UserRecord | null>();
      expect(doc?.pendingEmail).toBe('new@example.com');
    });

    it('невалидный ObjectId — NotFoundError (404), не CastError/500', async () => {
      await expect(
        service.setPendingEmail('не-id', 'a@example.com'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('несуществующий валидный id — NotFoundError', async () => {
      await expect(
        service.setPendingEmail('507f1f77bcf86cd799439011', 'a@example.com'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('confirmEmail', () => {
    it("pendingEmail совпал, email свободен — 'ok', email записан, pendingEmail снят", async () => {
      const userId = await createUser({ pendingEmail: 'confirm@example.com' });

      await expect(service.confirmEmail(userId, 'confirm@example.com')).resolves.toBe(
        'ok',
      );

      const doc = await model.findById(userId).lean<UserRecord | null>();
      expect(doc?.email).toBe('confirm@example.com');
      expect(doc?.pendingEmail).toBeUndefined();
    });

    it("повторный вызов после успеха — идемпотентно 'ok' (два открытых таба)", async () => {
      const userId = await createUser({ pendingEmail: 'confirm2@example.com' });
      await service.confirmEmail(userId, 'confirm2@example.com');

      await expect(service.confirmEmail(userId, 'confirm2@example.com')).resolves.toBe(
        'ok',
      );
    });

    it("pendingEmail не совпадает с токеном — 'stale'", async () => {
      const userId = await createUser({ pendingEmail: 'one@example.com' });

      await expect(service.confirmEmail(userId, 'two@example.com')).resolves.toBe(
        'stale',
      );
    });

    it("аккаунта нет вовсе — 'stale'", async () => {
      await expect(
        service.confirmEmail('68c9a000a000a000a000a099', 'ghost@example.com'),
      ).resolves.toBe('stale');
    });

    it("гонка: адрес успел стать чужим email — 'taken', не исключение/500", async () => {
      const userId = await createUser({ pendingEmail: 'race@example.com' });
      await createUser({ email: 'race@example.com' });

      await expect(service.confirmEmail(userId, 'race@example.com')).resolves.toBe(
        'taken',
      );
      // Read-after-write и для отказа тоже (CLAUDE.md «Тесты»): проигравший
      // не должен остаться с наполовину записанным email.
      const doc = await model.findById(userId).lean<UserRecord | null>();
      expect(doc?.email).toBeUndefined();
      expect(doc?.pendingEmail).toBe('race@example.com');
    });
  });
});
