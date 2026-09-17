// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): порядок списка, шифрование text/title, read-after-write на
// create/update, 404 у чужого/несуществующего id. ENCRYPTION_KEY — из
// test/jest.setup.ts (общий для всех спеков, читается один раз при импорте
// utils/encryption.ts).
import { Types, type Connection, type Model } from 'mongoose';
import {
  GradingCommentPresetRecord,
  GradingCommentPresetSchema,
} from './grading-comment-preset.schema';
import { GradingPresetsService } from './grading-presets.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const AUTHOR_ID = new Types.ObjectId().toString();

describe('GradingPresetsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<GradingCommentPresetRecord>;
  let service: GradingPresetsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<GradingCommentPresetRecord>(
      GradingCommentPresetRecord.name,
      GradingCommentPresetSchema,
    );
    service = new GradingPresetsService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('create → list: заготовка сразу видна (read-after-write)', async () => {
    const created = await service.create(
      { text: 'Хорошо, но проверьте стойку' },
      AUTHOR_ID,
    );

    const list = await service.list({});

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
    expect(list[0]?.text).toBe('Хорошо, но проверьте стойку');
    expect(list[0]?.createdBy).toBe(AUTHOR_ID);
  });

  it('list: порядок — по времени создания, старые заготовки сверху', async () => {
    await service.create({ text: 'Первая' }, AUTHOR_ID);
    await service.create({ text: 'Вторая' }, AUTHOR_ID);
    await service.create({ text: 'Третья' }, AUTHOR_ID);

    const list = await service.list({});

    expect(list.map((preset) => preset.text)).toEqual(['Первая', 'Вторая', 'Третья']);
  });

  it('list: лимит ограничивает количество результатов', async () => {
    await service.create({ text: 'Первая' }, AUTHOR_ID);
    await service.create({ text: 'Вторая' }, AUTHOR_ID);

    const list = await service.list({ limit: 1 });

    expect(list).toHaveLength(1);
  });

  it('update → list: правка видна сразу (read-after-write)', async () => {
    const created = await service.create({ text: 'Черновик комментария' }, AUTHOR_ID);

    const updated = await service.update(created.id, { text: 'Готовый комментарий' });

    expect(updated.text).toBe('Готовый комментарий');
    const list = await service.list({});
    expect(list[0]?.text).toBe('Готовый комментарий');
  });

  it('update несуществующего id — NotFoundError', async () => {
    await expect(
      service.update(new Types.ObjectId().toString(), { text: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('remove: заготовка пропадает из списка, второй remove — NotFoundError', async () => {
    const created = await service.create({ text: 'Заготовка на удаление' }, AUTHOR_ID);

    await service.remove(created.id);

    expect(await service.list({})).toHaveLength(0);
    await expect(service.remove(created.id)).rejects.toMatchObject({ status: 404 });
  });

  it('text и title зашифрованы в сырой Mongo — расшифровка идёт только через сервис', async () => {
    const created = await service.create(
      { text: 'Секретный текст заготовки', title: 'Секретный заголовок' },
      AUTHOR_ID,
    );

    const raw = await model.collection.findOne<{ text?: string; title?: string }>({
      _id: new Types.ObjectId(created.id),
    });

    expect(raw?.text).toBeDefined();
    expect(raw?.text).not.toBe('Секретный текст заготовки');
    expect(raw?.title).toBeDefined();
    expect(raw?.title).not.toBe('Секретный заголовок');
  });
});
