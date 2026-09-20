// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): уникальность (userId, month), идемпотентность confirm, обе
// ветки revoke, read-after-write «подтвердил → listMine видит paid».
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { SettingsRecord } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { decryptPayment, type RawLeanPayment } from './payment.mapper';
import { monthKeyOf } from './payment-month';
import { PaymentRecord } from './payment.schema';
import { PaymentsService } from './payments.service';

const NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });

describe('PaymentsService', () => {
  let memory: MemoryMongo;
  let paymentModel: Model<PaymentRecord>;
  let userModel: Model<UserRecord>;
  let service: PaymentsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    const connection = memory.connection;
    paymentModel = connection.model<PaymentRecord>(PaymentRecord.name);
    userModel = connection.model<UserRecord>(UserRecord.name);
    const settingsModel = connection.model<SettingsRecord>(SettingsRecord.name);
    const classModel = connection.model<ClassRecord>(ClassRecord.name);
    const lessonModel = connection.model<LessonRecord>(LessonRecord.name);
    const usersService = new UsersService(userModel);
    const settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      usersService,
    );
    service = new PaymentsService(paymentModel, userModel, settingsService);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await paymentModel.deleteMany({});
    await userModel.deleteMany({});
  });

  async function createStudent(name = 'Ученик'): Promise<string> {
    const doc = await userModel.create({ name, roles: [], status: 'active' });
    return doc._id.toString();
  }

  async function createAccountant(): Promise<string> {
    const doc = await userModel.create({
      name: 'Бухгалтер',
      roles: ['accountant'],
      status: 'active',
    });
    return doc._id.toString();
  }

  it('второй insert с тем же (userId, month) падает — уникальный индекс', async () => {
    const userId = await createStudent();
    await paymentModel.create({ userId, month: '2026-09', status: 'unpaid' });

    await expect(
      paymentModel.create({ userId, month: '2026-09', status: 'unpaid' }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
  });

  it('confirm дважды подряд — один документ, confirmedAt не сдвигается', async () => {
    const userId = await createStudent();
    const accountantId = await createAccountant();

    const first = await service.confirm(
      userId,
      '2026-09',
      { amountMinor: 25000, note: 'перевод от 5 сентября' },
      accountantId,
      NOW,
    );
    expect(first.status).toBe('paid');

    const second = await service.confirm(
      userId,
      '2026-09',
      { amountMinor: 30000 },
      accountantId,
      NOW.plus({ hours: 3 }),
    );

    expect(second.confirmedAt).toBe(first.confirmedAt);
    expect(second.amountMinor).toBe(25000);
    expect(await paymentModel.countDocuments({ userId, month: '2026-09' })).toBe(1);
  });

  it('revoke со скриншотом — переходит в awaiting, документ остаётся', async () => {
    const userId = await createStudent();
    const accountantId = await createAccountant();
    await service.confirm(userId, '2026-09', {}, accountantId, NOW);
    await paymentModel.updateOne(
      { userId, month: '2026-09' },
      {
        $set: {
          screenshotKind: 'telegram',
          screenshotFileId: 'f1',
          screenshotFileUniqueId: 'u1',
        },
      },
    );

    const revoked = await service.revoke(userId, '2026-09');

    expect(revoked.status).toBe('awaiting');
    expect(revoked.confirmedAt).toBeUndefined();
    expect(await paymentModel.countDocuments({ userId, month: '2026-09' })).toBe(1);
  });

  it('revoke без скриншота — документ удаляется целиком, месяц снова «не оплачен»', async () => {
    const userId = await createStudent();
    const accountantId = await createAccountant();
    await service.confirm(userId, '2026-09', {}, accountantId, NOW);

    const revoked = await service.revoke(userId, '2026-09');

    expect(revoked.status).toBe('unpaid');
    expect(await paymentModel.countDocuments({ userId, month: '2026-09' })).toBe(0);
  });

  it('нечего снимать — понятный отказ (409), документа нет', async () => {
    const userId = await createStudent();
    await expect(service.revoke(userId, '2026-09')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('read-after-write: подтвердил → listMine того же ученика показывает paid', async () => {
    const userId = await createStudent();
    const accountantId = await createAccountant();
    await service.confirm(userId, '2026-09', { amountMinor: 25000 }, accountantId, NOW);

    const mine = await service.listMine(userId);

    expect(mine.find((p) => p.month === '2026-09')?.status).toBe('paid');
  });

  it('listMonth: активный ученик без документа — unpaid, не пропуск строки', async () => {
    const userId = await createStudent('Без документа');

    const page = await service.listMonth({ month: '2026-09' }, NOW);

    expect(page.rows.find((r) => r.userId === userId)?.status).toBe('unpaid');
  });

  it('listMonth: сотрудник школы не попадает в список — это не ученик', async () => {
    await createAccountant();

    const page = await service.listMonth({ month: '2026-09' }, NOW);

    expect(page.rows).toHaveLength(0);
  });

  it('confirm сотруднику школы — отказ, оплата не заводится', async () => {
    const staffId = await createAccountant();

    await expect(
      service.confirm(staffId, '2026-09', {}, staffId, NOW),
    ).rejects.toMatchObject({ status: 400 });
    expect(await paymentModel.countDocuments({})).toBe(0);
  });

  it('confirm несуществующему id — 404, не 500', async () => {
    await expect(
      service.confirm(
        '000000000000000000000000',
        '2026-09',
        {},
        '000000000000000000000000',
        NOW,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('confirm с мусором вместо ObjectId в пути — 404, не CastError-500 (SECURITY §3)', async () => {
    await expect(
      service.confirm('не-id-вовсе', '2026-09', {}, '000000000000000000000000', NOW),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('confirm/revoke с кривым месяцем в пути — 400: путь не проходит через DTO', async () => {
    const userId = await createStudent();
    const accountantId = await createAccountant();

    await expect(
      service.confirm(userId, '2026-13', {}, accountantId, NOW),
    ).rejects.toMatchObject({ status: 400 });
    await expect(service.revoke(userId, '2026-13')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('listMonth без month в query — берёт текущий месяц в поясе школы из настроек', async () => {
    const page = await service.listMonth({}, NOW);

    expect(page.month).toBe(monthKeyOf(NOW, 'Asia/Jerusalem'));
  });

  it('listMonth: документ со всеми полями — сумма, дата подтверждения в ISO UTC, скриншот, напоминание', async () => {
    const userId = await createStudent();
    await paymentModel.create({
      userId,
      month: '2026-09',
      status: 'paid',
      amountMinor: 25050,
      confirmedAt: NOW.toJSDate(),
      screenshotKind: 'telegram',
      screenshotFileId: 'f1',
      screenshotFileUniqueId: 'u1',
      reminderSentAt: NOW.minus({ days: 3 }).toJSDate(),
    });

    const page = await service.listMonth({ month: '2026-09' }, NOW);

    const row = page.rows.find((r) => r.userId === userId);
    expect(row).toEqual({
      userId,
      userName: 'Ученик',
      month: '2026-09',
      status: 'paid',
      amountMinor: 25050,
      confirmedAt: NOW.toUTC().toISO(),
      hasScreenshot: true,
      reminderSentAt: NOW.minus({ days: 3 }).toUTC().toISO(),
    });
  });

  it('attachScreenshot: новый скриншот заводит документ awaiting', async () => {
    const userId = await createStudent();

    const status = await service.attachScreenshot(
      userId,
      '2026-09',
      { fileId: 'f1', fileUniqueId: 'u1' },
      NOW,
    );

    expect(status).toBe('awaiting');
    const mine = await service.listMine(userId);
    expect(mine.find((p) => p.month === '2026-09')).toMatchObject({
      status: 'awaiting',
      hasScreenshot: true,
    });
  });

  it('attachScreenshot: повторный скриншот не плодит второй документ и заменяет file_id', async () => {
    const userId = await createStudent();
    await service.attachScreenshot(
      userId,
      '2026-09',
      { fileId: 'f1', fileUniqueId: 'u1' },
      NOW,
    );

    await service.attachScreenshot(
      userId,
      '2026-09',
      { fileId: 'f2', fileUniqueId: 'u2' },
      NOW.plus({ minutes: 5 }),
    );

    expect(await paymentModel.countDocuments({ userId, month: '2026-09' })).toBe(1);
    const raw = await paymentModel
      .findOne({ userId, month: '2026-09' })
      .lean<RawLeanPayment | null>();
    if (!raw) throw new Error('документ не найден');
    const doc = decryptPayment(raw);
    expect(doc.screenshotFileId).toBe('f2');
    expect(doc.screenshotFileUniqueId).toBe('u2');
  });

  it('attachScreenshot на уже paid месяц — статус остаётся paid, скриншот всё равно сохраняется', async () => {
    const userId = await createStudent();
    const accountantId = await createAccountant();
    await service.confirm(userId, '2026-09', {}, accountantId, NOW);

    const status = await service.attachScreenshot(
      userId,
      '2026-09',
      { fileId: 'f1', fileUniqueId: 'u1' },
      NOW,
    );

    expect(status).toBe('paid');
    const mine = await service.listMine(userId);
    expect(mine.find((p) => p.month === '2026-09')).toMatchObject({
      status: 'paid',
      hasScreenshot: true,
    });
  });

  it('attachScreenshot штату школы — отказ, оплата не заводится (ADR-0026)', async () => {
    const staffId = await createAccountant();

    await expect(
      service.attachScreenshot(
        staffId,
        '2026-09',
        { fileId: 'f1', fileUniqueId: 'u1' },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await paymentModel.countDocuments({})).toBe(0);
  });

  it('listMonth: документ без confirmedAt/reminderSentAt (ждёт подтверждения) — оба undefined, не «Invalid DateTime»', async () => {
    const userId = await createStudent();
    await paymentModel.create({ userId, month: '2026-09', status: 'awaiting' });

    const page = await service.listMonth({ month: '2026-09' }, NOW);

    const row = page.rows.find((r) => r.userId === userId);
    expect(row).toEqual({
      userId,
      userName: 'Ученик',
      month: '2026-09',
      status: 'awaiting',
      amountMinor: undefined,
      confirmedAt: undefined,
      hasScreenshot: false,
      reminderSentAt: undefined,
    });
  });
});
