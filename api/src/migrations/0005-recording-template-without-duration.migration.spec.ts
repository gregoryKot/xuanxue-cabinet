// Правка чужого текста в проде — самое место для теста на настоящей Mongo:
// миграция должна заменить ровно старый дефолт и не тронуть шаблон, который
// учитель писал сам.
import type { Connection, Model } from 'mongoose';
import { recordingTemplateWithoutDuration } from './0005-recording-template-without-duration.migration';
import { SettingsRecord, SETTINGS_SCHOOL_ID } from '../settings/settings.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const OLD_TEMPLATE =
  '{название}[: {тема}][. Занятие {длительность}][, ведёт {ведущий}][ — {ссылка}]';
const NEW_TEMPLATE = '{название}[: {тема}][, ведёт {ведущий}][ — {ссылка}]';
const LESSON_LINK = 'Через {минут} минут {название}\n{ссылка}';

describe('Миграция 0005-recording-template-without-duration', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let settingsModel: Model<SettingsRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createSettings(recording: string) {
    await settingsModel.create({
      _id: SETTINGS_SCHOOL_ID,
      templates: { lessonLink: LESSON_LINK, recording },
      tz: 'Asia/Jerusalem',
    });
  }

  async function storedRecording(): Promise<string | undefined> {
    const doc = await settingsModel.findById(SETTINGS_SCHOOL_ID).lean();
    return doc?.templates.recording;
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

  it('нетронутый старый дефолт — заменяет на шаблон без длительности', async () => {
    await createSettings(OLD_TEMPLATE);

    await recordingTemplateWithoutDuration.up(db());

    expect(await storedRecording()).toBe(NEW_TEMPLATE);
  });

  it('шаблон, который правил учитель, не трогает', async () => {
    const own = '{название} — запись занятия. Ведёт {ведущий}. {ссылка}';
    await createSettings(own);

    await recordingTemplateWithoutDuration.up(db());

    expect(await storedRecording()).toBe(own);
  });

  it('повторный запуск ничего не меняет', async () => {
    await createSettings(OLD_TEMPLATE);

    await recordingTemplateWithoutDuration.up(db());
    await recordingTemplateWithoutDuration.up(db());

    expect(await storedRecording()).toBe(NEW_TEMPLATE);
  });

  it('настроек ещё нет — миграция молчит, приложение стартует', async () => {
    await expect(recordingTemplateWithoutDuration.up(db())).resolves.toBeUndefined();

    expect(await settingsModel.countDocuments()).toBe(0);
  });
});
