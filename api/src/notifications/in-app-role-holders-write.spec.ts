// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): выбор
// получателей и уникальный индекс (userId, kind, paymentMonth) — запросы, мок
// модели их бы пропустил.
import type { Connection, Model } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { writeToRoleHolders } from './in-app-role-holders-write';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { NotificationRecord, NotificationSchema } from './notification.schema';

describe('writeToRoleHolders', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let notificationModel: Model<NotificationRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;
  let usersService: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    notificationModel = connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    prefsModel = connection.model<NotificationPrefsRecord>(NotificationPrefsRecord.name);
    usersService = new UsersService(userModel);
    await notificationModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await notificationModel.deleteMany({});
    await prefsModel.deleteMany({});
  });

  async function createUser(
    name: string,
    roles: UserRole[],
    status: 'active' | 'blocked' = 'active',
  ): Promise<string> {
    const user = await userModel.create({ name, roles, status });
    return user._id.toString();
  }

  it('пишет строку каждому активному бухгалтеру, остальным ролям — нет', async () => {
    const accountantId = await createUser('Маша', ['accountant']);
    const blockedId = await createUser('Заблокированная', ['accountant'], 'blocked');
    const teacherId = await createUser('Пётр', ['teacher']);

    const count = await writeToRoleHolders(usersService, notificationModel, {
      kind: 'payments',
      paymentMonth: '2026-09',
    });

    expect(count).toBe(1);
    const rows = await notificationModel.find({}).lean();
    expect(rows.map((r) => r.userId)).toEqual([accountantId]);
    expect(rows[0]).toMatchObject({ kind: 'payments', paymentMonth: '2026-09' });
    expect(rows.map((r) => r.userId)).not.toContain(blockedId);
    expect(rows.map((r) => r.userId)).not.toContain(teacherId);
  });

  // Смысл функции — страховка: выключенный вид не отменяет строку (ADR-0156).
  it('бухгалтер выключил вид payments — строка всё равно пишется', async () => {
    const accountantId = await createUser('Маша', ['accountant']);
    await prefsModel.create({
      userId: accountantId,
      overrides: [{ kind: 'payments', enabled: false }],
    });

    const count = await writeToRoleHolders(usersService, notificationModel, {
      kind: 'payments',
      paymentMonth: '2026-09',
    });

    expect(count).toBe(1);
    await expect(
      notificationModel.countDocuments({ userId: accountantId }),
    ).resolves.toBe(1);
  });

  it('повтор за тот же месяц — одна строка на бухгалтера, снова непрочитанная', async () => {
    const accountantId = await createUser('Маша', ['accountant']);
    const input = { kind: 'payments' as const, paymentMonth: '2026-09' };
    await writeToRoleHolders(usersService, notificationModel, input);
    await notificationModel.updateOne(
      { userId: accountantId },
      { $set: { readAt: new Date(), dismissedAt: new Date() } },
    );

    await writeToRoleHolders(usersService, notificationModel, input);

    const rows = await notificationModel.find({ userId: accountantId }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.readAt).toBeNull();
    expect(rows[0]?.dismissedAt).toBeNull();
  });

  it('другой месяц — отдельная строка', async () => {
    const accountantId = await createUser('Маша', ['accountant']);

    await writeToRoleHolders(usersService, notificationModel, {
      kind: 'payments',
      paymentMonth: '2026-09',
    });
    await writeToRoleHolders(usersService, notificationModel, {
      kind: 'payments',
      paymentMonth: '2026-10',
    });

    await expect(
      notificationModel.countDocuments({ userId: accountantId }),
    ).resolves.toBe(2);
  });

  it('в школе нет бухгалтера — ноль, без ошибки', async () => {
    await createUser('Пётр', ['teacher']);

    await expect(
      writeToRoleHolders(usersService, notificationModel, {
        kind: 'payments',
        paymentMonth: '2026-09',
      }),
    ).resolves.toBe(0);
  });
});
