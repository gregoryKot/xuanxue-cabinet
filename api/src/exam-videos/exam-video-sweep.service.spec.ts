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
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
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
  let abortMultipartUpload: jest.Mock;

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
    abortMultipartUpload = jest.fn().mockResolvedValue(undefined);
    service = new ExamVideoSweepService(
      videoModel,
      itemModel,
      attemptModel,
      store.fileStore,
      orphans,
      new VideoUploadsService(
        { abortMultipartUpload } as unknown as MultipartStoreService,
        {} as ObjectHeadService,
        orphans,
      ),
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
      status: 'ready',
      fingerprint: 'test',
    });
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: createdAt.toJSDate() } },
    );
    return doc._id.toString();
  }

  // ADR-0165: видео, которое грузится частями, ссылки ещё ждут — сиротой оно
  // не считается, а брошенное (неделя без движения) убирает общее ядро.
  async function makeUpload(options: {
    idleDays: number;
    uploadId?: string;
  }): Promise<string> {
    const doc = await videoModel.create({
      key: `exam-videos/${new Types.ObjectId().toString()}`,
      sizeBytes: 100,
      fingerprint: 'test',
      status: 'uploading',
      ...(options.uploadId ? { uploadId: options.uploadId } : {}),
    });
    const idleSince = NOW.minus({ days: options.idleDays }).toJSDate();
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: idleSince, updatedAt: idleSince } },
    );
    return doc._id.toString();
  }

  it('идущая загрузка старше суток — не сирота, остаётся', async () => {
    await makeUpload({ idleDays: 2 });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(0);
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('брошенная загрузка старше недели — прерывается в R2 и удаляется, свежая остаётся', async () => {
    await makeUpload({ idleDays: 8, uploadId: 'upload-stale' });
    const fresh = await makeUpload({ idleDays: 1, uploadId: 'upload-fresh' });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
    expect(abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(abortMultipartUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^exam-videos\//),
      'upload-stale',
      NOW,
    );
    const left = await videoModel.find({}, { _id: 1 }).lean();
    expect(left.map((doc) => doc._id.toString())).toEqual([fresh]);
  });

  it('R2 выключен — брошенная загрузка не трогается', async () => {
    store.enabled.value = false;
    await makeUpload({ idleDays: 8 });

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 0 });
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('видео без поля status (записано до ADR-0165) — готовое: сирота убирается как раньше', async () => {
    await videoModel.collection.insertOne({
      key: 'exam-videos/legacy',
      contentType: 'video/mp4',
      sizeBytes: 1,
      createdAt: NOW.minus({ hours: 25 }).toJSDate(),
      updatedAt: NOW.minus({ hours: 25 }).toJSDate(),
    });

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
  });

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
