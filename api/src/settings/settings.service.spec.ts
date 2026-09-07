// Против настоящей Mongo (CLAUDE.md «Тесты»): upsert по фиксированному
// `_id` — единственная вещь, которую тут стоит проверять на реальном
// индексе, а не на моке модели.
import type { Connection, Model } from 'mongoose';
import { DEFAULT_TEMPLATES } from '@xuanxue/shared';
import { SettingsRecord, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('SettingsService.get', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<SettingsRecord>;
  let service: SettingsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    service = new SettingsService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('создаёт документ школы с дефолтными шаблонами при первом обращении', async () => {
    const settings = await service.get();

    expect(settings).toEqual({
      templates: {
        lesson_link: DEFAULT_TEMPLATES.lesson_link,
        recording: DEFAULT_TEMPLATES.recording,
      },
      tz: 'Asia/Jerusalem',
    });
    await expect(model.countDocuments({})).resolves.toBe(1);
  });

  it('второй вызов не создаёт второй документ и отдаёт тот же результат', async () => {
    const first = await service.get();
    const second = await service.get();

    expect(second).toEqual(first);
    await expect(model.countDocuments({})).resolves.toBe(1);
  });

  it('документ уже есть — второй вызов читает findById, не делает upsert-запись', async () => {
    await service.get();
    const upsertSpy = jest.spyOn(model, 'findOneAndUpdate');

    await service.get();

    expect(upsertSpy).not.toHaveBeenCalled();
    upsertSpy.mockRestore();
  });

  it('гонка двух первых обращений сходится на одном документе', async () => {
    const [a, b] = await Promise.all([service.get(), service.get()]);

    expect(a).toEqual(b);
    await expect(model.countDocuments({})).resolves.toBe(1);
  });
});

// Настоящая гонка двух upsert по одному `_id` не гарантированно бросает
// E11000 в один прогон (зависит от таймингов MongoMemoryServer) — ветку
// «проигравший читает уже созданный документ» проверяем отдельно фейком
// модели, не дожидаясь недетерминированного совпадения (CLAUDE.md
// «Детерминизм»).
describe('SettingsService.get — гонка E11000 (фейк модели)', () => {
  it('первого чтения нет, upsert бросил дубль — читает уже созданный документ', async () => {
    const doc = {
      templates: { lessonLink: 'шаблон', recording: 'запись' },
      tz: 'Asia/Jerusalem',
    };
    // Первый findById (до upsert) — документа ещё нет (конкурент не успел);
    // второй (в catch после E11000) — уже есть, конкурент его создал.
    let findByIdCalls = 0;
    const fakeModel = {
      findOneAndUpdate: () => ({
        lean: () => Promise.reject(Object.assign(new Error('E11000'), { code: 11000 })),
      }),
      findById: () => ({
        lean: () => Promise.resolve(findByIdCalls++ === 0 ? null : doc),
      }),
    } as unknown as Model<SettingsRecord>;
    const raceService = new SettingsService(fakeModel);

    await expect(raceService.get()).resolves.toEqual({
      templates: { lesson_link: 'шаблон', recording: 'запись' },
      tz: 'Asia/Jerusalem',
    });
    expect(findByIdCalls).toBe(2);
  });
});
