// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// общий removeIfDraft делят ExamItemsService и ExamsService (ТЗ 4.3, п.5),
// модель здесь любая со статусом draft/published/archived — берём
// ExamItemSchema, он уже есть в проекте.
import type { Connection, Model } from 'mongoose';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { removeIfDraft } from './remove-if-draft';

const NOT_FOUND_MESSAGE = 'не найден';
const NOT_DRAFT_MESSAGE = 'не черновик';

describe('removeIfDraft', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ExamItemRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('черновик — удаляется', async () => {
    const doc = await model.create({ kind: 'text', prompt: 'x', status: 'draft' });

    await removeIfDraft(model, doc._id.toString(), NOT_FOUND_MESSAGE, NOT_DRAFT_MESSAGE);

    await expect(model.findById(doc._id)).resolves.toBeNull();
  });

  it('опубликованный — ConflictError, документ остаётся', async () => {
    const doc = await model.create({ kind: 'text', prompt: 'x', status: 'published' });

    await expect(
      removeIfDraft(model, doc._id.toString(), NOT_FOUND_MESSAGE, NOT_DRAFT_MESSAGE),
    ).rejects.toThrow(NOT_DRAFT_MESSAGE);
    await expect(model.findById(doc._id)).resolves.not.toBeNull();
  });

  it('нет такого id — NotFoundError', async () => {
    const missingId = '507f1f77bcf86cd799439011';

    await expect(
      removeIfDraft(model, missingId, NOT_FOUND_MESSAGE, NOT_DRAFT_MESSAGE),
    ).rejects.toThrow(NOT_FOUND_MESSAGE);
  });
});
