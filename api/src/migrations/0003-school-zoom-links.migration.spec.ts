// Миграция пишет шифротекст сырым драйвером мимо схемы — проверяем сквозь
// расшифровку: записали → прочитали моделью → decrypt вернул ту же ссылку.
// Ссылки приходят из `api/seed/zoom-links.local.json` (вне репозитория,
// 2026-09-12: репозиторий стал публичным) — тест сам пишет туда фикстуру с
// выдуманными ссылками и убирает её за собой. Занятия берёт из 0001: пара
// (title, groupLabel) — единственное, чем эти миграции связаны, и разойтись
// они не должны молча.
import { rmSync, writeFileSync } from 'fs';
import type { Connection, Model } from 'mongoose';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fillSchoolZoomLinks, SEED_PATH } from './0003-school-zoom-links.migration';
import { ClassRecord } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { decrypt } from '../utils/encryption';

const PASSWORD = '00000';
const SEED = [
  {
    title: 'Тайцзицюань',
    groupLabel: '',
    zoomLink: 'https://zoom.example/j/plain',
    zoomPassword: PASSWORD,
  },
  {
    title: 'Тайцзицюань',
    groupLabel: 'среда',
    zoomLink: 'https://zoom.example/j/wednesday',
    zoomPassword: PASSWORD,
  },
  {
    title: 'Основы Дхармы',
    groupLabel: '',
    zoomLink: 'https://zoom.example/j/dharma',
    zoomPassword: PASSWORD,
  },
];

function writeSeed(content: string): void {
  writeFileSync(SEED_PATH, content, 'utf8');
}

function removeSeed(): void {
  rmSync(SEED_PATH, { force: true });
}

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
    removeSeed();
    await memory.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    writeSeed(JSON.stringify(SEED));
  });

  it('занятия из файла получают ссылку и пароль', async () => {
    await seedAndFill();

    const dharma = await model.findOne({ title: 'Основы Дхармы' }).lean();
    expect(decrypt(dharma?.zoomLink)).toBe('https://zoom.example/j/dharma');
    expect(decrypt(dharma?.zoomPassword)).toBe(PASSWORD);
  });

  it('ссылки лежат зашифрованными, а не открытым текстом', async () => {
    await seedAndFill();

    const dharma = await model.findOne({ title: 'Основы Дхармы' }).lean();
    expect(dharma?.zoomLink).not.toContain('zoom.example');
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
    const before = await model.findOne({ title: 'Основы Дхармы' }).lean();

    await fillSchoolZoomLinks.up(db());

    const after = await model.findOne({ title: 'Основы Дхармы' }).lean();
    expect(after?.zoomLink).toBe(before?.zoomLink);
  });

  // Прод уже применил миграцию, новой установке ссылки впишут в кабинете —
  // отсутствие локального файла не имеет права ронять старт приложения.
  it('файла нет — ничего не делает и не падает', async () => {
    removeSeed();
    await seedSchoolClasses.up(db());

    await expect(fillSchoolZoomLinks.up(db())).resolves.toBeUndefined();

    const dharma = await model.findOne({ title: 'Основы Дхармы' }).lean();
    expect(dharma?.zoomLink).toBeUndefined();
  });

  it('файл битый — тоже молчит, а не падает', async () => {
    writeSeed('{ это не json');
    await seedSchoolClasses.up(db());

    await expect(fillSchoolZoomLinks.up(db())).resolves.toBeUndefined();
  });

  it('в файле не массив — пустой список, не падение', async () => {
    writeSeed('{"title":"Тайцзицюань"}');
    await seedSchoolClasses.up(db());

    await expect(fillSchoolZoomLinks.up(db())).resolves.toBeUndefined();
    const plain = await model.findOne({ title: 'Тайцзицюань', groupLabel: '' }).lean();
    expect(plain?.zoomLink).toBeUndefined();
  });

  it('на пустой базе молчит, а не падает', async () => {
    await expect(fillSchoolZoomLinks.up(db())).resolves.toBeUndefined();
    expect(await model.countDocuments()).toBe(0);
  });
});
