// Миграция трогает чужие записи в проде — проверяем на настоящей Mongo
// (образец: 0005-…spec.ts): черновики становятся опубликованными, архивные и
// уже опубликованные не меняются, второй запуск ничего не портит.
import type { Connection, Model } from 'mongoose';
import { examItemsPublishedByDefault } from './0006-exam-items-published-by-default.migration';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { ExamItemStatus } from '@xuanxue/shared';

describe('Миграция 0006-exam-items-published-by-default', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let itemModel: Model<ExamItemRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createItem(prompt: string, status: ExamItemStatus) {
    const created = await itemModel.create({ kind: 'text', prompt, status });
    return created._id.toString();
  }

  async function statusOf(id: string): Promise<ExamItemStatus | undefined> {
    const doc = await itemModel.findById(id).lean();
    return doc?.status;
  }

  async function updatedAtOf(id: string): Promise<number | undefined> {
    const doc = await itemModel.findById(id).lean<{ updatedAt?: Date }>();
    return doc?.updatedAt?.getTime();
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await itemModel.deleteMany({});
  });

  it('черновик становится опубликованным', async () => {
    const id = await createItem('Стойка мабу', 'draft');

    await examItemsPublishedByDefault.up(db());

    expect(await statusOf(id)).toBe('published');
  });

  it('архивный и уже опубликованный не трогает', async () => {
    const archived = await createItem('Старый вопрос', 'archived');
    const published = await createItem('Живой вопрос', 'published');
    const publishedUpdatedAt = await updatedAtOf(published);

    await examItemsPublishedByDefault.up(db());

    expect(await statusOf(archived)).toBe('archived');
    expect(await statusOf(published)).toBe('published');
    expect(await updatedAtOf(published)).toBe(publishedUpdatedAt);
  });

  it('повторный запуск ничего не меняет', async () => {
    const id = await createItem('Стойка мабу', 'draft');

    await examItemsPublishedByDefault.up(db());
    const afterFirst = await updatedAtOf(id);
    await examItemsPublishedByDefault.up(db());

    expect(await statusOf(id)).toBe('published');
    expect(await updatedAtOf(id)).toBe(afterFirst);
  });

  it('банк пуст — миграция молчит, приложение стартует', async () => {
    await expect(examItemsPublishedByDefault.up(db())).resolves.toBeUndefined();

    expect(await itemModel.countDocuments()).toBe(0);
  });
});
