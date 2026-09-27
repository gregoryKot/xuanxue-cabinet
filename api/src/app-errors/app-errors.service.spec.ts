// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): read-after-write, шифрование text, обрезка полей, потолок числа
// записей, фильтры списка, last24h, пустая база, TTL-индекс. ENCRYPTION_KEY —
// из test/jest.setup.ts (общий для всех спеков).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { APP_ERROR_LIMITS } from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { AppErrorRecord, AppErrorSchema } from './app-error.schema';
import { AppErrorsService } from './app-errors.service';

const NOW = DateTime.fromISO('2026-09-27T12:00:00Z', { zone: 'utc' });

describe('AppErrorsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<AppErrorRecord>;
  let service: AppErrorsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<AppErrorRecord>(AppErrorRecord.name, AppErrorSchema);
    service = new AppErrorsService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('record → list: запись сразу видна (read-after-write)', async () => {
    await service.record(
      { source: 'server', kind: 'server', method: 'POST', path: '/api/x', text: 'boom' },
      NOW,
    );

    const { items } = await service.list({}, NOW);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'server',
      kind: 'server',
      method: 'POST',
      path: '/api/x',
      text: 'boom',
      occurredAt: '2026-09-27T12:00:00.000Z',
    });
  });

  it('text в базе зашифрован — сырое чтение коллекции не содержит открытого текста', async () => {
    await service.record(
      {
        source: 'browser',
        kind: 'render',
        path: '/exams',
        text: 'секретный стек вызова',
      },
      NOW,
    );

    const raw = await connection.collection('app_errors').findOne({});
    expect(raw?.text).toBeDefined();
    expect(raw?.text).not.toContain('секретный стек вызова');
  });

  it('слишком длинный текст и path обрезаны по APP_ERROR_LIMITS', async () => {
    const longText = 'x'.repeat(APP_ERROR_LIMITS.text + 50);
    const longPath = `/${'a'.repeat(APP_ERROR_LIMITS.path + 50)}`;

    await service.record(
      { source: 'server', kind: 'server', method: 'GET', path: longPath, text: longText },
      NOW,
    );

    const { items } = await service.list({}, NOW);
    expect(items[0]?.text).toHaveLength(APP_ERROR_LIMITS.text);
    expect(items[0]?.path).toHaveLength(APP_ERROR_LIMITS.path);
  });

  it('path режется от query ещё раз на сервере — клиенту (браузеру) не верим', async () => {
    await service.record(
      {
        source: 'browser',
        kind: 'render',
        path: '/exams?token=secret',
        text: 'x',
      },
      NOW,
    );

    const { items } = await service.list({}, NOW);
    expect(items[0]?.path).toBe('/exams');
  });

  it('потолок записей: вставка сверх APP_ERROR_LIMITS.maxRecords удаляет самые старые', async () => {
    // Малый потолок через прямую вставку моделью в обход record() —
    // record() сам считает APP_ERROR_LIMITS.maxRecords константой, поэтому
    // тест накатывает записи чуть больше реального потолка (5000) было бы
    // слишком долго — проверяем логику через приватный метод той же формы,
    // подсовывая записи напрямую и вызывая service.record() один раз поверх
    // них, чтобы не дублировать константу отдельным сервисом с иным потолком.
    const overflow = 3;
    const base = DateTime.fromISO('2026-01-01T00:00:00Z', { zone: 'utc' });
    const docs = Array.from(
      { length: APP_ERROR_LIMITS.maxRecords - 1 + overflow },
      (_, i) => ({
        source: 'server' as const,
        kind: 'server' as const,
        path: '/api/x',
        text: `запись ${i}`,
        occurredAt: base.plus({ minutes: i }).toJSDate(),
      }),
    );
    await model.insertMany(docs);

    // Ещё одна запись через сам сервис — она свежее всех и обязана остаться,
    // trimOverCap должен унести самые старые сверх потолка.
    await service.record(
      { source: 'server', kind: 'server', path: '/api/newest', text: 'самая свежая' },
      base.plus({ days: 1 }),
    );

    const total = await model.countDocuments({});
    expect(total).toBe(APP_ERROR_LIMITS.maxRecords);
    const stillNewest = await model.findOne({ path: '/api/newest' }).lean();
    expect(stillNewest).not.toBeNull();
    const oldestSurvivor = await model.find({}).sort({ occurredAt: 1 }).limit(1).lean();
    // Самые старые (индексы 0..overflow-1) должны были уйти.
    expect(oldestSurvivor[0]?.text).not.toBe('запись 0');
  }, 30_000);

  it('фильтр по requestId — точное совпадение', async () => {
    await service.record(
      { requestId: 'req-1', source: 'server', kind: 'server', path: '/a', text: 'x' },
      NOW,
    );
    await service.record(
      { requestId: 'req-2', source: 'server', kind: 'server', path: '/b', text: 'y' },
      NOW,
    );

    const { items } = await service.list({ requestId: 'req-1' }, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe('/a');
  });

  it('фильтр по source и kind', async () => {
    await service.record(
      { source: 'browser', kind: 'render', path: '/a', text: 'x' },
      NOW,
    );
    await service.record(
      { source: 'server', kind: 'server', path: '/b', text: 'y' },
      NOW,
    );

    expect((await service.list({ source: 'server' }, NOW)).items).toHaveLength(1);
    expect((await service.list({ kind: 'render' }, NOW)).items).toHaveLength(1);
  });

  it('лимит списка — по умолчанию и явный', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.record(
        { source: 'server', kind: 'server', path: `/${i}`, text: 'x' },
        NOW.plus({ minutes: i }),
      );
    }

    const limited = await service.list({ limit: 2 }, NOW);
    expect(limited.items).toHaveLength(2);
    // Свежие сверху.
    expect(limited.items[0]?.path).toBe('/2');
  });

  it('last24h: без chunk и без записей старше 24 часов', async () => {
    await service.record(
      { source: 'server', kind: 'server', path: '/a', text: 'x' },
      NOW.minus({ hours: 1 }),
    );
    await service.record(
      { source: 'browser', kind: 'chunk', path: '/b', text: 'y' },
      NOW.minus({ hours: 1 }),
    );
    await service.record(
      { source: 'server', kind: 'server', path: '/c', text: 'z' },
      NOW.minus({ hours: 25 }),
    );

    const { last24h } = await service.list({}, NOW);
    expect(last24h).toBe(1);
  });

  it('пустая база — items: [], last24h: 0', async () => {
    const result = await service.list({}, NOW);
    expect(result).toEqual({ items: [], last24h: 0 });
  });

  it('TTL-индекс на occurredAt существует с APP_ERROR_LIMITS.retentionDays', async () => {
    const indexes = await model.collection.indexes();
    const ttl = indexes.find(
      (index) =>
        'occurredAt' in index.key &&
        index.key.occurredAt === 1 &&
        'expireAfterSeconds' in index,
    );
    expect(ttl?.expireAfterSeconds).toBe(APP_ERROR_LIMITS.retentionDays * 24 * 60 * 60);
  });
});
