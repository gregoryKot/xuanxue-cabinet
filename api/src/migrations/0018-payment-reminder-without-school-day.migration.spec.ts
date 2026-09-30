// Миграция снимает день школы у напоминания об оплате (ADR-0161) и не трогает
// остальные поля напоминания: включатель, время и шаблон остались за школой.
import type { Connection } from 'mongoose';
import { paymentReminderWithoutSchoolDay } from './0018-payment-reminder-without-school-day.migration';
import { SETTINGS_SCHOOL_ID } from '../settings/settings.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const TEMPLATE = '{имя}, напоминаем об оплате за {месяц}.';

describe('Миграция 0018-payment-reminder-without-school-day', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createSettings(paymentReminder?: Record<string, unknown>) {
    await db()
      .collection('settings')
      .insertOne({
        _id: SETTINGS_SCHOOL_ID as never,
        tz: 'Asia/Jerusalem',
        ...(paymentReminder ? { paymentReminder } : {}),
      });
  }

  async function stored() {
    return db()
      .collection('settings')
      .findOne({ _id: SETTINGS_SCHOOL_ID as never });
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await db().collection('settings').deleteMany({});
  });

  it('снимает день школы и оставляет включатель, время и шаблон', async () => {
    await createSettings({
      enabled: true,
      dayOfMonth: 12,
      time: '10:00',
      template: TEMPLATE,
    });

    await paymentReminderWithoutSchoolDay.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder).toEqual({
      enabled: true,
      time: '10:00',
      template: TEMPLATE,
    });
  });

  it('у школы без дня документ не меняется', async () => {
    await createSettings({ enabled: false, time: '10:00' });
    const before = await stored();

    await paymentReminderWithoutSchoolDay.up(db());

    expect(await stored()).toEqual(before);
  });

  it('подобъекта paymentReminder нет вовсе — ничего не создаёт', async () => {
    await createSettings();

    await paymentReminderWithoutSchoolDay.up(db());

    expect((await stored())?.paymentReminder).toBeUndefined();
  });

  it('повторный запуск ничего не меняет', async () => {
    await createSettings({ enabled: true, dayOfMonth: 5, time: '09:30' });

    await paymentReminderWithoutSchoolDay.up(db());
    await paymentReminderWithoutSchoolDay.up(db());

    expect((await stored())?.paymentReminder).toEqual({ enabled: true, time: '09:30' });
  });

  it('настроек ещё нет — миграция молчит, приложение стартует', async () => {
    await expect(paymentReminderWithoutSchoolDay.up(db())).resolves.toBeUndefined();

    expect(await db().collection('settings').countDocuments()).toBe(0);
  });
});
