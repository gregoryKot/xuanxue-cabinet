// Свой день напоминания (ADR-0161) против настоящей Mongo: GET /me/payments
// показывает `reminder`, только когда школа напоминание включила; запись дня
// и сброс возвращают то, что ученик увидит следом (read-after-write).
import { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import {
  DEFAULT_PAYMENT_REMINDER,
  PAYMENT_REMINDER_DISABLED_MESSAGE,
  type PaymentReminderSettings,
  type SettingsDto,
} from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import type { SettingsService } from '../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord } from '../users/user.schema';
import { PaymentRecord } from './payment.schema';
import {
  PaymentReminderDayService,
  toMyReminderDto,
} from './payment-reminder-day.service';
import { PaymentsService } from './payments.service';

// payments.userId — ObjectId, поэтому и id учеников настоящие, не STUDENT_A.
const STUDENT_A = new Types.ObjectId().toString();
const STUDENT_B = new Types.ObjectId().toString();
const NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });
const SCHOOL: PaymentReminderSettings = {
  ...DEFAULT_PAYMENT_REMINDER,
  enabled: true,
  time: '10:00',
};

describe('toMyReminderDto', () => {
  it('школа выключила — undefined, поля в ответе не будет', () => {
    expect(toMyReminderDto({ ...SCHOOL, enabled: false }, 12)).toBeUndefined();
  });

  it('свой день не выбран — dayOfMonth: null, дня школы нет', () => {
    expect(toMyReminderDto(SCHOOL, undefined)).toEqual({
      dayOfMonth: null,
      time: '10:00',
    });
  });

  it('свой день выбран — он и час школы', () => {
    expect(toMyReminderDto(SCHOOL, 20)).toEqual({
      dayOfMonth: 20,
      time: '10:00',
    });
  });
});

describe('PaymentReminderDayService', () => {
  let memory: MemoryMongo;
  let prefsModel: Model<NotificationPrefsRecord>;
  let school: PaymentReminderSettings;
  let days: PaymentReminderDayService;
  let payments: PaymentsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    const connection = memory.connection;
    prefsModel = connection.model<NotificationPrefsRecord>(NotificationPrefsRecord.name);
    const settings = {
      get: () =>
        Promise.resolve({
          tz: 'Asia/Jerusalem',
          paymentReminder: school,
          paymentContact: 'Маше',
        } as SettingsDto),
    } as unknown as SettingsService;
    days = new PaymentReminderDayService(
      new NotificationPrefsService(prefsModel),
      settings,
    );
    payments = new PaymentsService(
      connection.model<PaymentRecord>(PaymentRecord.name),
      connection.model<UserRecord>(UserRecord.name),
      settings,
      days,
    );
  }, 60_000);

  beforeEach(() => {
    school = { ...SCHOOL };
  });

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await prefsModel.deleteMany({});
  });

  it('школа выключила: GET без поля reminder, PUT — 409 доменной ошибкой, ничего не записано', async () => {
    school = { ...SCHOOL, enabled: false };

    const page = await payments.listMine(STUDENT_A, NOW);
    await expect(days.set(STUDENT_A, 12)).rejects.toThrow(ConflictError);
    await expect(days.set(STUDENT_A, 12)).rejects.toThrow(
      PAYMENT_REMINDER_DISABLED_MESSAGE,
    );

    expect(page).not.toHaveProperty('reminder');
    expect(await prefsModel.countDocuments({})).toBe(0);
  });

  it('школа включила, ученик ничего не выбирал — день не выбран (null)', async () => {
    const page = await payments.listMine(STUDENT_A, NOW);

    expect(page.reminder).toEqual({ dayOfMonth: null, time: '10:00' });
  });

  it('PUT → GET: свой день виден, а другой ученик его не видит (владение по userId)', async () => {
    const written = await days.set(STUDENT_A, 20);

    expect(written).toEqual({ dayOfMonth: 20, time: '10:00' });
    expect((await payments.listMine(STUDENT_A, NOW)).reminder).toEqual(written);
    expect((await payments.listMine(STUDENT_B, NOW)).reminder?.dayOfMonth).toBeNull();
  });

  it('null снимает выбор: в ответе записи и в GET день null', async () => {
    await days.set(STUDENT_A, 20);

    const reset = await days.set(STUDENT_A, null);

    expect(reset).toEqual({ dayOfMonth: null, time: '10:00' });
    expect((await payments.listMine(STUDENT_A, NOW)).reminder).toEqual(reset);
  });

  it('школа выключила и снова включила — выбор ученика сохранился', async () => {
    await days.set(STUDENT_A, 20);
    school = { ...SCHOOL, enabled: false };
    expect((await payments.listMine(STUDENT_A, NOW)).reminder).toBeUndefined();

    school = { ...SCHOOL };

    expect((await payments.listMine(STUDENT_A, NOW)).reminder?.dayOfMonth).toBe(20);
  });
});
