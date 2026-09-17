// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// запрос на «кто ссылается» идёт по плоским imageIds двух разных коллекций,
// мок модели пропустил бы ошибку в самом запросе. `createdAt` выставляется
// вручную через `collection.updateOne` (сырой драйвер, мимо timestamps-плагина
// Mongoose — тот молча вырезает явный createdAt из $set) — детерминизм, без
// зависимости от настоящих часов (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { ExamImageSweepService } from './exam-image-sweep.service';
import { ExamImageRecord, ExamImageSchema } from './exam-image.schema';

const NOW = DateTime.utc(2026, 9, 15, 12, 0, 0);

describe('ExamImageSweepService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let imageModel: Model<ExamImageRecord>;
  let itemModel: Model<ExamItemRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let service: ExamImageSweepService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name, ExamImageSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    service = new ExamImageSweepService(imageModel, itemModel, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await imageModel.deleteMany({});
    await itemModel.deleteMany({});
    await attemptModel.deleteMany({});
  });

  async function makeImage(createdAt: DateTime): Promise<string> {
    const doc = await imageModel.create({
      bytes: Buffer.from('байты картинки'),
      contentType: 'image/jpeg',
      sizeBytes: 1,
    });
    // Через .collection (не через .updateOne модели) — timestamps-плагин
    // Mongoose иначе молча стирает явный createdAt из $set (immutable-поле).
    await imageModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: createdAt.toJSDate() } },
    );
    return doc._id.toString();
  }

  it('свежая сирота (создана «сейчас») не удаляется', async () => {
    await makeImage(NOW);

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(imageModel.countDocuments({})).resolves.toBe(1);
  });

  it('старая сирота (без ссылок нигде) — удаляется', async () => {
    await makeImage(NOW.minus({ hours: 25 }));

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
    await expect(imageModel.countDocuments({})).resolves.toBe(0);
  });

  it('старая, но в imageIds вопроса банка — остаётся', async () => {
    const imageId = await makeImage(NOW.minus({ hours: 25 }));
    await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      imageIds: [new Types.ObjectId(imageId)],
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(imageModel.countDocuments({})).resolves.toBe(1);
  });

  it('старая, но в imageIds попытки — остаётся', async () => {
    const imageId = await makeImage(NOW.minus({ hours: 25 }));
    await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Экзамен',
      userId: new Types.ObjectId(),
      attemptNo: 1,
      startedAt: NOW.toJSDate(),
      imageIds: [new Types.ObjectId(imageId)],
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(imageModel.countDocuments({})).resolves.toBe(1);
  });

  it('повторный вызов идемпотентен — второй раз удалять уже нечего', async () => {
    await makeImage(NOW.minus({ hours: 25 }));

    const first = await service.removeOrphans(NOW);
    const second = await service.removeOrphans(NOW.plus({ minutes: 1 }));

    expect(first.removed).toBe(1);
    expect(second.removed).toBe(0);
  });

  it('несколько старых сирот за один тик — удаляет все разом', async () => {
    await makeImage(NOW.minus({ hours: 25 }));
    await makeImage(NOW.minus({ hours: 30 }));
    const referenced = await makeImage(NOW.minus({ hours: 25 }));
    await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      imageIds: [new Types.ObjectId(referenced)],
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(2);
    await expect(imageModel.countDocuments({})).resolves.toBe(1);
  });
});
