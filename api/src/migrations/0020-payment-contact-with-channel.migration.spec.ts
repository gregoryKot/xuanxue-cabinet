// Правка чужого текста в проде — самое место для теста на настоящей Mongo:
// миграция должна заменить ровно прежний дефолт шаблона напоминания и прежний
// дефолт контакта для оплаты, а текст, который учитель писал сам, не тронуть
// (ADR-0159).
import type { Connection, Model } from 'mongoose';
import { paymentContactWithChannel } from './0020-payment-contact-with-channel.migration';
import { SettingsRecord, SETTINGS_SCHOOL_ID } from '../settings/settings.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const OLD_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nСкриншот перевода пришлите {контакт} в Telegram.';
const NEW_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nСкриншот об оплате отправьте {контакт}.';
const OLD_CONTACT = 'Маше @marievyazova';
const NEW_CONTACT = 'Маше Вязовой — например, в Telegram @marievyazova';
const LESSON_LINK = 'Через {минут} минут {название}\n{ссылка}';
const RECORDING = '{название}[, ведёт {ведущий}][ — {ссылка}]';

interface RawSettings {
  paymentContact?: string;
  paymentReminder?: { template?: string };
  updatedAt?: Date;
}

describe('Миграция 0020-payment-contact-with-channel', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let settingsModel: Model<SettingsRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createSettings(fields: {
    template?: string;
    enabled?: boolean;
    paymentContact?: string;
  }) {
    await settingsModel.create({
      _id: SETTINGS_SCHOOL_ID,
      templates: { lessonLink: LESSON_LINK, recording: RECORDING },
      tz: 'Asia/Jerusalem',
      ...(fields.paymentContact ? { paymentContact: fields.paymentContact } : {}),
      ...(fields.enabled !== undefined
        ? {
            paymentReminder: {
              enabled: fields.enabled,
              ...(fields.template ? { template: fields.template } : {}),
            },
          }
        : {}),
    });
  }

  async function stored() {
    return settingsModel.findById(SETTINGS_SCHOOL_ID).lean();
  }

  // Сырой документ, с `updatedAt`: второй запуск не должен даже трогать метку.
  async function rawSettings(): Promise<RawSettings | null> {
    return db()
      .collection('settings')
      .findOne<RawSettings>({ _id: SETTINGS_SCHOOL_ID as never });
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await settingsModel.deleteMany({});
  });

  it('нетронутый шаблон и контакт — заменяет оба на новые', async () => {
    await createSettings({
      enabled: true,
      template: OLD_TEMPLATE,
      paymentContact: OLD_CONTACT,
    });

    await paymentContactWithChannel.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder?.template).toBe(NEW_TEMPLATE);
    expect(doc?.paymentReminder?.enabled).toBe(true);
    expect(doc?.paymentContact).toBe(NEW_CONTACT);
  });

  it('свой шаблон и свой контакт не трогает', async () => {
    const ownTemplate = '{имя}, не забудьте про оплату за {месяц}. Пишите {контакт}.';
    const ownContact = 'Кате @katya_books';
    await createSettings({
      enabled: true,
      template: ownTemplate,
      paymentContact: ownContact,
    });

    await paymentContactWithChannel.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder?.template).toBe(ownTemplate);
    expect(doc?.paymentContact).toBe(ownContact);
  });

  it('заменяет только то, что совпало: прежний контакт при своём шаблоне', async () => {
    const ownTemplate = '{имя}, оплата за {месяц}: {контакт}.';
    await createSettings({
      enabled: true,
      template: ownTemplate,
      paymentContact: OLD_CONTACT,
    });

    await paymentContactWithChannel.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder?.template).toBe(ownTemplate);
    expect(doc?.paymentContact).toBe(NEW_CONTACT);
  });

  it('полей нет — ничего не создаёт, дефолты подставятся на чтении', async () => {
    await createSettings({});

    await paymentContactWithChannel.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder).toBeUndefined();
    expect(doc?.paymentContact).toBeUndefined();
  });

  it('повторный запуск ничего не меняет', async () => {
    await createSettings({
      enabled: false,
      template: OLD_TEMPLATE,
      paymentContact: OLD_CONTACT,
    });

    await paymentContactWithChannel.up(db());
    const first = await rawSettings();
    await paymentContactWithChannel.up(db());
    const second = await rawSettings();

    expect(second).toEqual(first);
    expect(second?.paymentContact).toBe(NEW_CONTACT);
    expect(second?.paymentReminder?.template).toBe(NEW_TEMPLATE);
  });

  it('настроек ещё нет — миграция молчит, приложение стартует', async () => {
    await expect(paymentContactWithChannel.up(db())).resolves.toBeUndefined();

    expect(await settingsModel.countDocuments()).toBe(0);
  });
});
