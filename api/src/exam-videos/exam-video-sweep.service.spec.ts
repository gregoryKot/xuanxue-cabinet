// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты») — тот же образец, что exam-image-sweep.service.spec.ts, плюс
// хранилище: удаление объекта идёт через StorageOrphansService (ADR-0079),
// не напрямую FileStoreService.remove.
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
import { ExamVideoSweepService } from './exam-video-sweep.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

const NOW = DateTime.utc(2026, 9, 15, 12, 0, 0);

function fakeFileStore(): { fileStore: FileStoreService; enabled: { value: boolean } } {
  const enabled = { value: true };
  const fileStore = {
    get isEnabled() {
      return enabled.value;
    },
    remove: () => Promise.resolve(),
  } as unknown as FileStoreService;
  return { fileStore, enabled };
}

describe('ExamVideoSweepService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let itemModel: Model<ExamItemRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let service: ExamVideoSweepService;
  let store: ReturnType<typeof fakeFileStore>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    store = fakeFileStore();
    const orphans = new StorageOrphansService(orphanModel, store.fileStore);
    service = new ExamVideoSweepService(
      videoModel,
      itemModel,
      attemptModel,
      store.fileStore,
      orphans,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    store.enabled.value = true;
    await Promise.all([
      videoModel.deleteMany({}),
      itemModel.deleteMany({}),
      attemptModel.deleteMany({}),
      orphanModel.deleteMany({}),
    ]);
  });

  async function makeVideo(createdAt: DateTime): Promise<string> {
    const doc = await videoModel.create({
      key: `exam-videos/${new Types.ObjectId().toString()}`,
      contentType: 'video/mp4',
      sizeBytes: 1,
    });
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: createdAt.toJSDate() } },
    );
    return doc._id.toString();
  }

  it('R2 выключен — шаг ничего не делает', async () => {
    store.enabled.value = false;
    await makeVideo(NOW.minus({ hours: 25 }));

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('свежая сирота (создана «сейчас») не удаляется', async () => {
    await makeVideo(NOW);

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('старая сирота (без ссылок нигде) — удаляется', async () => {
    await makeVideo(NOW.minus({ hours: 25 }));

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
    await expect(videoModel.countDocuments({})).resolves.toBe(0);
  });

  it('старая, но в videoIds вопроса банка — остаётся', async () => {
    const videoId = await makeVideo(NOW.minus({ hours: 25 }));
    await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      videoIds: [new Types.ObjectId(videoId)],
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('старая, но в videoIds попытки — остаётся', async () => {
    const videoId = await makeVideo(NOW.minus({ hours: 25 }));
    await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Экзамен',
      userId: new Types.ObjectId(),
      attemptNo: 1,
      startedAt: NOW.toJSDate(),
      videoIds: [new Types.ObjectId(videoId)],
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('уборка кладёт ключ в журнал сирот и снимает его после удаления из R2', async () => {
    await makeVideo(NOW.minus({ hours: 25 }));

    await service.removeOrphans(NOW);

    await expect(orphanModel.countDocuments({})).resolves.toBe(0);
  });
});
