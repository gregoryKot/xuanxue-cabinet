// Продолжение exam-video-sweep.service.spec.ts (тот на потолке
// файла-храповика): батч-лимит уборки с фильтрацией обязан тестироваться
// сценарием «весь батч отфильтрован» (аудит 2026-10-01, F54). Та же настоящая
// Mongo и тот же фейк хранилища, что в основном спеке.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import type { FileStoreService } from '../storage/file-store.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { ExamVideoSweepService, SWEEP_BATCH_LIMIT } from './exam-video-sweep.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

const NOW = DateTime.utc(2026, 10, 2, 12, 0, 0);

describe('ExamVideoSweepService — батч из используемых', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let itemModel: Model<ExamItemRecord>;
  let service: ExamVideoSweepService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    const attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    const orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    const fileStore = {
      isEnabled: true,
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService;
    service = new ExamVideoSweepService(
      videoModel,
      itemModel,
      attemptModel,
      fileStore,
      new StorageOrphansService(orphanModel, fileStore),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  async function makeVideo(createdAt: DateTime): Promise<Types.ObjectId> {
    const doc = await videoModel.create({
      key: `exam-videos/${new Types.ObjectId().toString()}`,
      contentType: 'video/mp4',
      sizeBytes: 1,
    });
    // Через .collection — timestamps-плагин Mongoose иначе молча стирает
    // явный createdAt из $set (immutable-поле).
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: createdAt.toJSDate() } },
    );
    return doc._id;
  }

  // Раньше батч из первых SWEEP_BATCH_LIMIT старых видео состоял из одних
  // используемых, и сирота моложе их не удалялась никогда.
  it('сирота за пределами батча используемых — удаляется за один тик', async () => {
    const used: Types.ObjectId[] = [];
    for (let i = 0; i < SWEEP_BATCH_LIMIT; i += 1) {
      used.push(await makeVideo(NOW.minus({ hours: 48, minutes: i })));
    }
    await itemModel.create({ kind: 'text', prompt: 'вопрос', videoIds: used });
    const orphan = await makeVideo(NOW.minus({ hours: 25 }));

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 1 });

    await expect(videoModel.exists({ _id: orphan })).resolves.toBeNull();
    await expect(videoModel.countDocuments({})).resolves.toBe(SWEEP_BATCH_LIMIT);
  });
});
