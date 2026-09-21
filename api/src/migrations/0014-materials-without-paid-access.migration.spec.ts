// Против настоящей Mongo (mongodb-memory-server, образец —
// 0010-drop-user-tz.migration.spec.ts). Пишем документы напрямую нативным
// драйвером, не через Mongoose .create(): миграция обязана отработать на
// данных, которые реально лежат в проде до деплоя, а схема после
// contract-шага полей `materialsPaidAccess`/`access: 'paid'` уже не знает.
import { mongo, type Connection } from 'mongoose';
import {
  materialsWithoutPaidAccess,
  REMOVED_ACCESS_PAID,
} from './0014-materials-without-paid-access.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const { ObjectId } = mongo;
const SETTINGS = 'settings';
const MATERIALS = 'materials';

// Сырые формы документов — тот же приём, что у MigrationsDoc в
// migration.runner.ts: `_id` школы фиксированная строка, не ObjectId
// (SETTINGS_SCHOOL_ID, settings.schema.ts).
interface RawSettingsDoc {
  _id: string;
  materialsPaidAccess?: boolean;
  schoolSiteUrl?: string;
}
interface RawMaterialDoc {
  _id: mongo.ObjectId;
  access?: string;
  title?: string;
  classIds?: mongo.ObjectId[];
}

describe('Миграция 0014-materials-without-paid-access', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  function settingsCollection(): mongo.Collection<RawSettingsDoc> {
    return db().collection<RawSettingsDoc>(SETTINGS);
  }

  function materialsCollection(): mongo.Collection<RawMaterialDoc> {
    return db().collection<RawMaterialDoc>(MATERIALS);
  }

  async function insertSettings(fields: Partial<RawSettingsDoc>): Promise<void> {
    await settingsCollection().insertOne({
      _id: 'school',
      templates: { lessonLink: 'x', recording: 'y' },
      tz: 'Asia/Jerusalem',
      ...fields,
    } as RawSettingsDoc);
  }

  async function rawSettings(): Promise<RawSettingsDoc> {
    const doc = await settingsCollection().findOne({ _id: 'school' });
    if (!doc) throw new Error('документ школы не найден');
    return doc;
  }

  async function insertMaterial(fields: Partial<RawMaterialDoc>): Promise<string> {
    const id = new ObjectId();
    await materialsCollection().insertOne({
      _id: id,
      title: 'т',
      url: 'https://example.com/x',
      kind: 'book',
      classIds: [],
      lessonIds: [],
      createdBy: new ObjectId(),
      ...fields,
    } as RawMaterialDoc);
    return id.toString();
  }

  async function rawMaterial(id: string): Promise<RawMaterialDoc> {
    const doc = await materialsCollection().findOne({ _id: new ObjectId(id) });
    if (!doc) throw new Error(`материал ${id} не найден`);
    return doc;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await settingsCollection().deleteMany({});
    await materialsCollection().deleteMany({});
  });

  it('settings: снимает materialsPaidAccess = false', async () => {
    await insertSettings({ materialsPaidAccess: false });

    await materialsWithoutPaidAccess.up(db());

    expect('materialsPaidAccess' in (await rawSettings())).toBe(false);
  });

  it('settings: снимает materialsPaidAccess = true', async () => {
    await insertSettings({ materialsPaidAccess: true });

    await materialsWithoutPaidAccess.up(db());

    expect('materialsPaidAccess' in (await rawSettings())).toBe(false);
  });

  it('settings: документ без поля не ломается, остальные поля целы', async () => {
    await insertSettings({ schoolSiteUrl: 'https://xuanxue.su' });

    await expect(materialsWithoutPaidAccess.up(db())).resolves.toBeUndefined();

    const doc = await rawSettings();
    expect('materialsPaidAccess' in doc).toBe(false);
    expect(doc.schoolSiteUrl).toBe('https://xuanxue.su');
  });

  it('materials: access "paid" переводится в "all"', async () => {
    const id = await insertMaterial({ access: REMOVED_ACCESS_PAID });

    await materialsWithoutPaidAccess.up(db());

    expect((await rawMaterial(id)).access).toBe('all');
  });

  it('materials: access "all" и "staff" не трогаются', async () => {
    const openId = await insertMaterial({ access: 'all' });
    const staffId = await insertMaterial({ access: 'staff' });

    await materialsWithoutPaidAccess.up(db());

    expect((await rawMaterial(openId)).access).toBe('all');
    expect((await rawMaterial(staffId)).access).toBe('staff');
  });

  it('materials: остальные поля документа остаются нетронутыми', async () => {
    const classId = new ObjectId();
    const id = await insertMaterial({
      access: REMOVED_ACCESS_PAID,
      title: 'секретный текст',
      classIds: [classId],
    });

    await materialsWithoutPaidAccess.up(db());

    const doc = await rawMaterial(id);
    expect(doc.title).toBe('секретный текст');
    expect(doc.classIds).toEqual([classId]);
  });

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    await insertSettings({ materialsPaidAccess: true });
    const id = await insertMaterial({ access: REMOVED_ACCESS_PAID });

    await materialsWithoutPaidAccess.up(db());
    await materialsWithoutPaidAccess.up(db());

    expect('materialsPaidAccess' in (await rawSettings())).toBe(false);
    expect((await rawMaterial(id)).access).toBe('all');
  });

  it('пустая база молчит', async () => {
    await expect(materialsWithoutPaidAccess.up(db())).resolves.toBeUndefined();

    expect(await settingsCollection().countDocuments()).toBe(0);
    expect(await materialsCollection().countDocuments()).toBe(0);
  });
});
