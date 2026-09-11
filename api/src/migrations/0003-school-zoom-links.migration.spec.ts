// Миграция пишет шифротекст сырым драйвером мимо схемы — проверяем сквозь
// расшифровку: записали → прочитали моделью → decrypt вернул ту же ссылку.
// Занятия берём из миграции 0001: пара (title, groupLabel) — единственное, чем
// эти две миграции связаны, и разойтись они не должны молча.
import type { Connection, Model } from 'mongoose';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fillSchoolZoomLinks } from './0003-school-zoom-links.migration';
import { ClassRecord } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { decrypt } from '../utils/encryption';

const EXPECTED_CLASSES = 11;

describe('Миграция 0003-school-zoom-links', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function seedAndFill(): Promise<void> {
    await seedSchoolClasses.up(db());
    await fillSchoolZoomLinks.up(db());
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ClassRecord>(ClassRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // Главное обещание: после деплоя на чистой базе ни одно занятие не остаётся
  // без ссылки. Расхождение названий между 0001 и 0003 проявится именно здесь.
  it('после 0001 у всех одиннадцати занятий есть ссылка и пароль', async () => {
    await seedAndFill();

    const classes = await model.find().lean();
    expect(classes).toHaveLength(EXPECTED_CLASSES);
    for (const cls of classes) {
      expect(decrypt(cls.zoomLink)).toMatch(/^https:\/\/\S*zoom\.us\//);
      expect(decrypt(cls.zoomPassword)).toBe('11111');
    }
  });

  it('ссылки лежат зашифрованными, а не открытым текстом', async () => {
    await seedAndFill();

    const classes = await model.find().lean();
    for (const cls of classes) {
      expect(cls.zoomLink).not.toContain('zoom.us');
    }
  });

  // Одна ссылка на слот, а не на день недели: у занятий-тёзок с разными
  // подписями группы ссылки разные, иначе ученик придёт не туда.
  it('занятия-тёзки получают разные ссылки', async () => {
    await seedAndFill();

    const [plain, wednesday] = await Promise.all([
      model.findOne({ title: 'Тайцзицюань', groupLabel: '' }).lean(),
      model.findOne({ title: 'Тайцзицюань', groupLabel: 'среда' }).lean(),
    ]);
    expect(decrypt(plain?.zoomLink)).not.toBe(decrypt(wednesday?.zoomLink));
  });

  it('вписанную раньше ссылку не затирает', async () => {
    const own = 'https://zoom.example/j/own';
    await seedSchoolClasses.up(db());
    await model.updateOne({ title: 'Основы Дхармы' }, { $set: { zoomLink: own } });

    await fillSchoolZoomLinks.up(db());

    const found = await model.findOne({ title: 'Основы Дхармы' }).lean();
    expect(decrypt(found?.zoomLink)).toBe(own);
  });

  it('идемпотентна: второй прогон не меняет записанное', async () => {
    await seedAndFill();
    const before = await model.findOne({ title: 'Цигун для глаз' }).lean();

    await fillSchoolZoomLinks.up(db());

    const after = await model.findOne({ title: 'Цигун для глаз' }).lean();
    expect(after?.zoomLink).toBe(before?.zoomLink);
  });

  it('на пустой базе молчит, а не падает', async () => {
    await expect(fillSchoolZoomLinks.up(db())).resolves.toBeUndefined();
    expect(await model.countDocuments()).toBe(0);
  });
});
