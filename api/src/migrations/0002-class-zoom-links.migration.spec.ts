// Миграция пишет шифротекст сырым драйвером мимо схемы — проверяем сквозь
// расшифровку: записали → прочитали моделью → decrypt вернул ту же ссылку.
// Ошибочные входы проверяем отдельно: миграция роняет старт приложения, и
// сообщение — единственное, что увидит владелец в логах Railway.
import { ConfigService } from '@nestjs/config';
import type { Connection, Model } from 'mongoose';
import { fillClassZoomLinks } from './0002-class-zoom-links.migration';
import { ClassRecord } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { decrypt } from '../utils/encryption';

const LINK = 'https://us02web.zoom.us/j/123456789';
const PASSWORD = '11111';

describe('Миграция 0002-class-zoom-links', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  function configWith(value?: string): ConfigService {
    return new ConfigService(value === undefined ? {} : { CLASS_ZOOM_LINKS: value });
  }

  function entriesJson(entries: unknown[]): string {
    return JSON.stringify(entries);
  }

  async function createClass(title: string, extra: Partial<ClassRecord> = {}) {
    return model.create({ title, groupLabel: '', format: 'online', ...extra });
  }

  async function linkOf(title: string): Promise<string | null> {
    const found = await model.findOne({ title }).lean();
    return decrypt(found?.zoomLink);
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

  it('переменной нет — занятие остаётся без ссылки', async () => {
    await createClass('Цигун для глаз');

    await fillClassZoomLinks.up(db(), configWith());

    expect(await linkOf('Цигун для глаз')).toBeNull();
  });

  it('вписывает ссылку и пароль, они читаются расшифрованными', async () => {
    await createClass('Цигун для глаз');

    await fillClassZoomLinks.up(
      db(),
      configWith(
        entriesJson([
          { title: 'Цигун для глаз', zoomLink: LINK, zoomPassword: PASSWORD },
        ]),
      ),
    );

    const found = await model.findOne({ title: 'Цигун для глаз' }).lean();
    expect(decrypt(found?.zoomLink)).toBe(LINK);
    expect(decrypt(found?.zoomPassword)).toBe(PASSWORD);
    // Шифротекст, а не открытая ссылка: политика полей класса — enc.
    expect(found?.zoomLink).not.toBe(LINK);
  });

  it('различает занятия-тёзки по подписи группы', async () => {
    await createClass('Тайцзицюань');
    await createClass('Тайцзицюань', { groupLabel: 'среда' });

    await fillClassZoomLinks.up(
      db(),
      configWith(
        entriesJson([{ title: 'Тайцзицюань', groupLabel: 'среда', zoomLink: LINK }]),
      ),
    );

    const [plain, wednesday] = await Promise.all([
      model.findOne({ title: 'Тайцзицюань', groupLabel: '' }).lean(),
      model.findOne({ title: 'Тайцзицюань', groupLabel: 'среда' }).lean(),
    ]);
    expect(decrypt(plain?.zoomLink)).toBeNull();
    expect(decrypt(wednesday?.zoomLink)).toBe(LINK);
  });

  // Вписанное руками важнее содержимого переменной: учитель мог поменять
  // ссылку в кабинете уже после того, как её поставили в Railway.
  it('не затирает ссылку, вписанную раньше', async () => {
    const own = 'https://zoom.example/j/own';
    await createClass('Основы Дхармы', { zoomLink: own });

    await fillClassZoomLinks.up(
      db(),
      configWith(entriesJson([{ title: 'Основы Дхармы', zoomLink: LINK }])),
    );

    expect(await linkOf('Основы Дхармы')).toBe(own);
  });

  it('второй прогон ничего не меняет', async () => {
    await createClass('Цигун для глаз');
    const config = configWith(entriesJson([{ title: 'Цигун для глаз', zoomLink: LINK }]));

    await fillClassZoomLinks.up(db(), config);
    const first = await model.findOne({ title: 'Цигун для глаз' }).lean();
    await fillClassZoomLinks.up(db(), config);
    const second = await model.findOne({ title: 'Цигун для глаз' }).lean();

    expect(second?.zoomLink).toBe(first?.zoomLink);
  });

  describe('кривой вход роняет старт с понятным сообщением', () => {
    it('не JSON', async () => {
      await expect(fillClassZoomLinks.up(db(), configWith('{кавычки'))).rejects.toThrow(
        /не разбирается как JSON/,
      );
    });

    it('не массив', async () => {
      await expect(fillClassZoomLinks.up(db(), configWith('{}'))).rejects.toThrow(
        /ожидается массив/,
      );
    });

    it('запись без ссылки — с её номером', async () => {
      const json = entriesJson([
        { title: 'Цигун для глаз', zoomLink: LINK },
        { title: 'Основы Дхармы' },
      ]);

      await expect(fillClassZoomLinks.up(db(), configWith(json))).rejects.toThrow(
        /запись №2/,
      );
    });

    it('название, которого нет в базе', async () => {
      const json = entriesJson([{ title: 'Занятие с опечаткой', zoomLink: LINK }]);

      await expect(fillClassZoomLinks.up(db(), configWith(json))).rejects.toThrow(
        /нет в базе/,
      );
    });
  });
});
