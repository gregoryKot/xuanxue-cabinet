// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»), тот же
// образец, что exam-video-sweep.service.spec.ts: брошенная загрузка, файл без
// ссылки, файл по сроку хранения (после проверки и без неё).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamGradingRecord, ExamGradingSchema } from '../exams/exam-grading.schema';
import { MediaAssetRecord, MediaAssetSchema } from '../media/media-asset.schema';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { FileStoreService } from '../storage/file-store.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { AnswerVideoSweepService } from './answer-video-sweep.service';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';

const NOW = DateTime.utc(2026, 9, 27, 12, 0, 0);

describe('AnswerVideoSweepService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<AnswerVideoRecord>;
  let mediaModel: Model<MediaAssetRecord>;
  let gradingModel: Model<ExamGradingRecord>;
  let multipart: { isEnabled: boolean; abortMultipartUpload: jest.Mock };
  let service: AnswerVideoSweepService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<AnswerVideoRecord>(
      AnswerVideoRecord.name,
      AnswerVideoSchema,
    );
    mediaModel = connection.model<MediaAssetRecord>(
      MediaAssetRecord.name,
      MediaAssetSchema,
    );
    gradingModel = connection.model<ExamGradingRecord>(
      ExamGradingRecord.name,
      ExamGradingSchema,
    );
    const orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    const fileStore = {
      isEnabled: true,
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService;
    const orphans = new StorageOrphansService(orphanModel, fileStore);
    multipart = {
      isEnabled: true,
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    };
    service = new AnswerVideoSweepService(
      videoModel,
      mediaModel,
      gradingModel,
      multipart as unknown as MultipartStoreService,
      orphans,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      videoModel.deleteMany({}),
      mediaModel.deleteMany({}),
      gradingModel.deleteMany({}),
    ]);
    jest.clearAllMocks();
    multipart.isEnabled = true;
  });

  async function makeVideo(
    overrides: Partial<{
      status: 'uploading' | 'ready';
      uploadId: string;
      updatedAtOverride: Date;
      completedAt: Date;
      attemptId: Types.ObjectId;
    }>,
  ): Promise<{ id: string; attemptId: Types.ObjectId }> {
    const attemptId = overrides.attemptId ?? new Types.ObjectId();
    const doc = await videoModel.create({
      userId: new Types.ObjectId(),
      attemptId,
      itemId: new Types.ObjectId(),
      key: `answer-videos/${new Types.ObjectId().toString()}`,
      sizeBytes: 100,
      fingerprint: '100:1',
      status: overrides.status ?? 'uploading',
      uploadId: overrides.uploadId,
      completedAt: overrides.completedAt,
    });
    if (overrides.updatedAtOverride) {
      await videoModel.collection.updateOne(
        { _id: doc._id },
        { $set: { updatedAt: overrides.updatedAtOverride } },
      );
    }
    return { id: doc._id.toString(), attemptId };
  }

  it('R2 выключен — шаг ничего не делает', async () => {
    multipart.isEnabled = false;
    await makeVideo({
      status: 'uploading',
      updatedAtOverride: NOW.minus({ days: 8 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    expect(await videoModel.countDocuments({})).toBe(1);
  });

  it('свежая незаконченная загрузка — не трогается', async () => {
    await makeVideo({ status: 'uploading' });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
  });

  it('брошенная загрузка старше недели — abortMultipartUpload и удаление', async () => {
    await makeVideo({
      status: 'uploading',
      uploadId: 'upload-x',
      updatedAtOverride: NOW.minus({ days: 8 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    expect(multipart.abortMultipartUpload).toHaveBeenCalledWith(
      expect.any(String),
      'upload-x',
      NOW,
    );
    expect(await videoModel.countDocuments({})).toBe(0);
  });

  it('отмена брошенной multipart-загрузки не удалась — best-effort, документ всё равно уходит', async () => {
    multipart.abortMultipartUpload.mockRejectedValueOnce(new Error('R2 недоступен'));
    await makeVideo({
      status: 'uploading',
      uploadId: 'upload-y',
      updatedAtOverride: NOW.minus({ days: 8 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    expect(await videoModel.countDocuments({})).toBe(0);
  });

  it('готовый файл без ссылки в media_assets старше суток — удаляется', async () => {
    await makeVideo({ status: 'ready', completedAt: NOW.minus({ days: 2 }).toJSDate() });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    expect(await videoModel.countDocuments({})).toBe(0);
  });

  it('готовый файл, на который ссылается media_assets — остаётся', async () => {
    const { id, attemptId } = await makeVideo({
      status: 'ready',
      completedAt: NOW.minus({ days: 2 }).toJSDate(),
    });
    await mediaModel.create({
      attemptId,
      userId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      kind: 'file',
      answerVideoId: new Types.ObjectId(id),
      sizeBytes: 100,
      receivedAt: NOW.toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    expect(await videoModel.countDocuments({ _id: id })).toBe(1);
  });

  it('проверенная попытка старше 90 дней — файл удаляется, media_assets теряет answerVideoId', async () => {
    const attemptId = new Types.ObjectId();
    const { id } = await makeVideo({
      status: 'ready',
      attemptId,
      completedAt: NOW.minus({ days: 30 }).toJSDate(),
    });
    await mediaModel.create({
      attemptId,
      userId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      kind: 'file',
      answerVideoId: new Types.ObjectId(id),
      sizeBytes: 100,
      receivedAt: NOW.toJSDate(),
    });
    await gradingModel.create({
      attemptId,
      examId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      graderId: new Types.ObjectId(),
      outcome: 'passed',
      gradedAt: NOW.minus({ days: 95 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    expect(await videoModel.countDocuments({ _id: id })).toBe(0);
    const media = await mediaModel
      .findOne({ attemptId })
      .lean<{ answerVideoId?: unknown }>();
    expect(media?.answerVideoId).toBeUndefined();
  });

  it('без проверки, но старше года — тоже удаляется', async () => {
    const { id } = await makeVideo({
      status: 'ready',
      completedAt: NOW.minus({ days: 366 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    expect(await videoModel.countDocuments({ _id: id })).toBe(0);
  });

  it('проверена недавно (меньше 90 дней) и моложе года — не трогается', async () => {
    const attemptId = new Types.ObjectId();
    const { id } = await makeVideo({
      status: 'ready',
      attemptId,
      completedAt: NOW.minus({ days: 5 }).toJSDate(),
    });
    await mediaModel.create({
      attemptId,
      userId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      kind: 'file',
      answerVideoId: new Types.ObjectId(id),
      sizeBytes: 100,
      receivedAt: NOW.toJSDate(),
    });
    await gradingModel.create({
      attemptId,
      examId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      graderId: new Types.ObjectId(),
      outcome: 'passed',
      gradedAt: NOW.minus({ days: 5 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
  });
});
