// Правка чужого текста в проде — самое место для теста на настоящей Mongo:
// миграция должна заменить ровно старый дефолт напоминания об оплате и не
// тронуть шаблон, который учитель писал сам (ADR-0157).
import type { Connection, Model } from 'mongoose';
import { paymentReminderTemplateWithoutSubscription } from './0016-payment-reminder-template-without-subscription.migration';
import { SettingsRecord, SETTINGS_SCHOOL_ID } from '../settings/settings.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const OLD_TEMPLATE =
  '{имя}, абонемент за {месяц} пока не отмечен оплаченным.\nЕсли вы уже перевели — пришлите скриншот сюда, и мы отметим.[ {ссылка}]';
const NEW_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nКогда переведёте — пришлите скриншот боту.[ {ссылка}]';
const LESSON_LINK = 'Через {минут} минут {название}\n{ссылка}';
const RECORDING = '{название}[, ведёт {ведущий}][ — {ссылка}]';

describe('Миграция 0016-payment-reminder-template-without-subscription', () => {
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

  it('нетронутый старый дефолт — заменяет на текст без «абонемента»', async () => {
    await createSettings({ enabled: true, template: OLD_TEMPLATE });

    await paymentReminderTemplateWithoutSubscription.up(db());

    const doc = await stored();
    expect(doc?.paymentReminder?.template).toBe(NEW_TEMPLATE);
    expect(doc?.paymentReminder?.enabled).toBe(true);
  });

  it('шаблон, который правил учитель, не трогает', async () => {
    const own = '{имя}, не забудьте про оплату за {месяц}.';
    await createSettings({ enabled: true, template: own });

    await paymentReminderTemplateWithoutSubscription.up(db());

    expect((await stored())?.paymentReminder?.template).toBe(own);
  });

  it('поля шаблона нет — ничего не создаёт, дефолт подставится на чтении', async () => {
    await createSettings({ enabled: true });

    await paymentReminderTemplateWithoutSubscription.up(db());

    expect((await stored())?.paymentReminder?.template).toBeUndefined();
  });

  it('подобъекта paymentReminder нет вовсе — документ не меняется', async () => {
    await createSettings();

    await paymentReminderTemplateWithoutSubscription.up(db());

    expect((await stored())?.paymentReminder).toBeUndefined();
  });

  it('повторный запуск ничего не меняет', async () => {
    await createSettings({ enabled: false, template: OLD_TEMPLATE });

    await paymentReminderTemplateWithoutSubscription.up(db());
    await paymentReminderTemplateWithoutSubscription.up(db());

    expect((await stored())?.paymentReminder?.template).toBe(NEW_TEMPLATE);
  });

  it('настроек ещё нет — миграция молчит, приложение стартует', async () => {
    await expect(
      paymentReminderTemplateWithoutSubscription.up(db()),
    ).resolves.toBeUndefined();

    expect(await settingsModel.countDocuments()).toBe(0);
  });
});
