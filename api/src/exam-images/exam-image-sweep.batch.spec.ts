// Продолжение exam-image-sweep.service.spec.ts (тот у потолка
// файла-храповика): батч-лимит уборки с фильтрацией обязан тестироваться
// сценарием «весь батч отфильтрован» (аудит 2026-10-01, F54). Та же настоящая
// Mongo, что в основном спеке.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { ExamImageSweepService, SWEEP_BATCH_LIMIT } from './exam-image-sweep.service';
import { ExamImageRecord, ExamImageSchema } from './exam-image.schema';

const NOW = DateTime.utc(2026, 10, 2, 12, 0, 0);

describe('ExamImageSweepService — батч из используемых', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let imageModel: Model<ExamImageRecord>;
  let itemModel: Model<ExamItemRecord>;
  let service: ExamImageSweepService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name, ExamImageSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    const attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    service = new ExamImageSweepService(imageModel, itemModel, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  async function makeImage(createdAt: DateTime): Promise<Types.ObjectId> {
    const doc = await imageModel.create({
      bytes: Buffer.from('байты картинки'),
      contentType: 'image/jpeg',
      sizeBytes: 1,
    });
    // Через .collection — timestamps-плагин Mongoose иначе молча стирает
    // явный createdAt из $set (immutable-поле).
    await imageModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: createdAt.toJSDate() } },
    );
    return doc._id;
  }

  // Раньше батч из первых SWEEP_BATCH_LIMIT старых картинок состоял из одних
  // используемых, и сирота моложе их не удалялась никогда.
  it('сирота за пределами батча используемых — удаляется за один тик', async () => {
    const used: Types.ObjectId[] = [];
    for (let i = 0; i < SWEEP_BATCH_LIMIT; i += 1) {
      used.push(await makeImage(NOW.minus({ hours: 48, minutes: i })));
    }
    await itemModel.create({ kind: 'text', prompt: 'вопрос', imageIds: used });
    const orphan = await makeImage(NOW.minus({ hours: 25 }));

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 1 });

    await expect(imageModel.exists({ _id: orphan })).resolves.toBeNull();
    await expect(imageModel.countDocuments({})).resolves.toBe(SWEEP_BATCH_LIMIT);
  });
});
