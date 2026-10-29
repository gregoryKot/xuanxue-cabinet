// Продолжение exam-video-sweep.service.spec.ts: исходный файл перегнанного видео
// (`originalKey`, ADR-0189) и уборщик. Требование владельца — исходник не пропадает
// никогда, кроме одного пути: уборщик убирает видео целиком, которое не нужно ни
// одному вопросу. Тогда уходят оба объекта; иначе исходник остался бы в R2 навсегда.
// Та же настоящая Mongo, журнал сирот настоящий, хранилище — фейк с записью удалений.
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
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { ExamVideoSweepService } from './exam-video-sweep.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

const NOW = DateTime.utc(2026, 10, 29, 12, 0, 0);
const KEY = 'exam-videos/h264';
const ORIGINAL_KEY = 'exam-videos/original-hevc';
// Записи журнала создаются по часам машины, а не по NOW: проход «через сутки» делаем
// заведомо позже любых часов.
const FAR_FUTURE = DateTime.utc(2100, 1, 1);

describe('ExamVideoSweepService — исходный файл перегнанного видео (ADR-0189)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let itemModel: Model<ExamItemRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let orphans: StorageOrphansService;
  let service: ExamVideoSweepService;
  let removed: string[];
  let failRemove: boolean;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    const attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    const fileStore = {
      isEnabled: true,
      remove: (key: string) => {
        if (failRemove) return Promise.reject(new Error('R2 недоступен'));
        removed.push(key);
        return Promise.resolve();
      },
    } as unknown as FileStoreService;
    orphans = new StorageOrphansService(orphanModel, fileStore);
    service = new ExamVideoSweepService(
      videoModel,
      itemModel,
      attemptModel,
      fileStore,
      orphans,
      new VideoUploadsService(
        {} as MultipartStoreService,
        {} as ObjectHeadService,
        orphans,
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    removed = [];
    failRemove = false;
  });

  afterEach(async () => {
    await Promise.all([
      videoModel.deleteMany({}),
      itemModel.deleteMany({}),
      orphanModel.deleteMany({}),
    ]);
  });

  /** Перегнанное видео: H.264 за `key`, исходник HEVC за `originalKey`; старше суток. */
  async function makeReplaced(): Promise<string> {
    const doc = await videoModel.create({
      key: KEY,
      contentType: 'video/mp4',
      sizeBytes: 1,
      status: 'ready',
      fingerprint: 'h264',
      videoCodec: 'avc',
      originalKey: ORIGINAL_KEY,
      originalContentType: 'video/quicktime',
      originalSizeBytes: 9,
      originalFingerprint: 'hevc',
    });
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: NOW.minus({ hours: 25 }).toJSDate() } },
    );
    return doc._id.toString();
  }

  it('видео в вопросе банка остаётся целиком: ни H.264, ни исходник не удаляются', async () => {
    const videoId = await makeReplaced();
    await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      videoIds: [new Types.ObjectId(videoId)],
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    expect(removed).toEqual([]);
    expect(await videoModel.findById(videoId).lean()).toMatchObject({
      key: KEY,
      originalKey: ORIGINAL_KEY,
    });
  });

  it('журнал сирот живого видео ничего не знает об исходнике: его проход через сутки ключ не берёт', async () => {
    const videoId = await makeReplaced();
    await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      videoIds: [new Types.ObjectId(videoId)],
    });
    await service.removeOrphans(NOW);

    const swept = await orphans.sweep(FAR_FUTURE);

    expect(swept.removed).toBe(0);
    expect(removed).not.toContain(ORIGINAL_KEY);
    await expect(orphanModel.countDocuments({})).resolves.toBe(0);
  });

  it('видео, которое не нужно никому, убирается целиком: оба объекта и документ', async () => {
    await makeReplaced();

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
    expect(removed.sort()).toEqual([KEY, ORIGINAL_KEY].sort());
    await expect(videoModel.countDocuments({})).resolves.toBe(0);
    await expect(orphanModel.countDocuments({})).resolves.toBe(0);
  });

  it('хранилище отказало: оба ключа остаются в журнале и их доберёт его проход, исходник не теряется', async () => {
    await makeReplaced();
    failRemove = true;

    await service.removeOrphans(NOW);

    const journal = (await orphanModel.find({}, { key: 1 }).lean()).map((doc) => doc.key);
    expect(journal.sort()).toEqual([KEY, ORIGINAL_KEY].sort());
    failRemove = false;
    await orphans.sweep(FAR_FUTURE);
    expect(removed.sort()).toEqual([KEY, ORIGINAL_KEY].sort());
  });
});
