// Правка чужого текста в проде — самое место для теста на настоящей Mongo:
// миграция должна заменить ровно прежние дефолты напоминания об оплате (оба) и
// не тронуть шаблон, который учитель писал сам (ADR-0159).
import type { Connection, Model } from 'mongoose';
import { paymentReminderTemplateContact } from './0017-payment-reminder-template-contact.migration';
import { SettingsRecord, SETTINGS_SCHOOL_ID } from '../settings/settings.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const FIRST_DEFAULT =
  '{имя}, абонемент за {месяц} пока не отмечен оплаченным.\nЕсли вы уже перевели — пришлите скриншот сюда, и мы отметим.[ {ссылка}]';
const SECOND_DEFAULT =
  '{имя}, напоминаем об оплате за {месяц}.\nКогда переведёте — пришлите скриншот боту.[ {ссылка}]';
const NEW_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nСкриншот перевода пришлите {контакт} в Telegram.';
const LESSON_LINK = 'Через {минут} минут {название}\n{ссылка}';
const RECORDING = '{название}[, ведёт {ведущий}][ — {ссылка}]';

describe('Миграция 0017-payment-reminder-template-contact', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let settingsModel: Model<SettingsRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createSettings(paymentReminder?: {
    enabled: boolean;
    template?: string;
  }) {
    await settingsModel.create({
      _id: SETTINGS_SCHOOL_ID,
      templates: { lessonLink: LESSON_LINK, recording: RECORDING },
      tz: 'Asia/Jerusalem',
      ...(paymentReminder ? { paymentReminder } : {}),
    });
  }

  async function stored() {
    return settingsModel.findById(SETTINGS_SCHOOL_ID).lean();
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

  it.each([
    ['первый дефолт (с «абонементом»)', FIRST_DEFAULT],
    ['второй дефолт (после 0016)', SECOND_DEFAULT],
  ])('нетронутый %s — заменяет на текст со {контакт}', async (_name, old) => {
    await createSettings({ enabled: true, template: old });

    await paymentReminderTemplateContact.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder?.template).toBe(NEW_TEMPLATE);
    expect(doc?.paymentReminder?.enabled).toBe(true);
  });

  it('шаблон, который правил учитель, не трогает', async () => {
    const own = '{имя}, не забудьте про оплату за {месяц}.';
    await createSettings({ enabled: true, template: own });

    await paymentReminderTemplateContact.up(db());

    expect((await stored())?.paymentReminder?.template).toBe(own);
  });

  it('поля шаблона нет — ничего не создаёт, дефолт подставится на чтении', async () => {
    await createSettings({ enabled: true });

    await paymentReminderTemplateContact.up(db());

    expect((await stored())?.paymentReminder?.template).toBeUndefined();
  });

  it('подобъекта paymentReminder нет вовсе — документ не меняется', async () => {
    await createSettings();

    await paymentReminderTemplateContact.up(db());

    expect((await stored())?.paymentReminder).toBeUndefined();
  });

  it('повторный запуск ничего не меняет', async () => {
    await createSettings({ enabled: false, template: SECOND_DEFAULT });

    await paymentReminderTemplateContact.up(db());
    await paymentReminderTemplateContact.up(db());

    expect((await stored())?.paymentReminder?.template).toBe(NEW_TEMPLATE);
  });

  it('настроек ещё нет — миграция молчит, приложение стартует', async () => {
    await expect(paymentReminderTemplateContact.up(db())).resolves.toBeUndefined();

    expect(await settingsModel.countDocuments()).toBe(0);
  });
});
