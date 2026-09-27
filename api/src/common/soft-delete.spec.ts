// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): общий softDelete делят ExamsService и ExamItemsService
// (ADR-0140), модель здесь любая — берём ExamItemSchema, он уже есть в
// проекте.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NOT_DELETED, softDelete } from './soft-delete';

const NOT_FOUND_MESSAGE = 'не найден';
const NOW = DateTime.utc(2026, 9, 27, 12, 0, 0);

describe('softDelete', () => {
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

  it('помечает deletedAt переданным «сейчас» — статус не важен', async () => {
    const doc = await model.create({ kind: 'text', prompt: 'x', status: 'published' });

    await softDelete(model, doc._id.toString(), NOW, NOT_FOUND_MESSAGE);

    const updated = await model.findById(doc._id).lean();
    expect(updated?.deletedAt?.toISOString()).toBe(NOW.toJSDate().toISOString());
  });

  it('повторный вызов на уже удалённый id — NotFoundError, дата не трогается', async () => {
    const doc = await model.create({ kind: 'text', prompt: 'x', status: 'published' });
    await softDelete(model, doc._id.toString(), NOW, NOT_FOUND_MESSAGE);

    const later = NOW.plus({ days: 1 });
    await expect(
      softDelete(model, doc._id.toString(), later, NOT_FOUND_MESSAGE),
    ).rejects.toThrow(NOT_FOUND_MESSAGE);

    const updated = await model.findById(doc._id).lean();
    expect(updated?.deletedAt?.toISOString()).toBe(NOW.toJSDate().toISOString());
  });

  it('нет такого id — NotFoundError', async () => {
    const missingId = '507f1f77bcf86cd799439011';

    await expect(softDelete(model, missingId, NOW, NOT_FOUND_MESSAGE)).rejects.toThrow(
      NOT_FOUND_MESSAGE,
    );
  });

  it('NOT_DELETED находит и старый документ без поля, и явно живой', async () => {
    await model.collection.insertOne({
      kind: 'text',
      prompt: 'старый',
      status: 'published',
    });
    await model.create({ kind: 'text', prompt: 'новый', status: 'published' });

    await expect(model.countDocuments(NOT_DELETED)).resolves.toBe(2);
  });
});
