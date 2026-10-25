// Уборщик видео записей занятий против настоящей Mongo (mongodb-memory-server, не
// мок — CLAUDE.md «Тесты»): готовое видео живёт, пока на него ссылается запись
// занятия; сирота старше суток и брошенная загрузка убираются. Удаление объекта
// идёт через StorageOrphansService (ADR-0079), не напрямую через FileStoreService.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import type { FileStoreService } from '../storage/file-store.service';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { LessonVideoSweepService } from './lesson-video-sweep.service';
import { LessonVideoRecord, LessonVideoSchema } from './lesson-video.schema';

const NOW = DateTime.utc(2026, 10, 10, 12, 0, 0);
const OLD = NOW.minus({ hours: 25 });

describe('LessonVideoSweepService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<LessonVideoRecord>;
  let lessonModel: Model<LessonRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let service: LessonVideoSweepService;
  let storageOn: boolean;
  let removedKeys: string[];
  let abortMultipartUpload: jest.Mock;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<LessonVideoRecord>(
      LessonVideoRecord.name,
      LessonVideoSchema,
    );
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    const fileStore = {
      get isEnabled() {
        return storageOn;
      },
      remove: (key: string) => {
        removedKeys.push(key);
        return Promise.resolve();
      },
    } as unknown as FileStoreService;
    const orphans = new StorageOrphansService(orphanModel, fileStore);
    abortMultipartUpload = jest.fn().mockResolvedValue(undefined);
    const uploads = new VideoUploadsService(
      { abortMultipartUpload } as unknown as MultipartStoreService,
      {} as ObjectHeadService,
      orphans,
    );
    service = new LessonVideoSweepService(
      videoModel,
      lessonModel,
      fileStore,
      orphans,
      uploads,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    storageOn = true;
    removedKeys = [];
  });

  afterEach(async () => {
    await Promise.all([
      videoModel.deleteMany({}),
      lessonModel.deleteMany({}),
      orphanModel.deleteMany({}),
    ]);
  });

  async function makeVideo(
    createdAt: DateTime,
    status: 'ready' | 'uploading' = 'ready',
  ): Promise<string> {
    const doc = await videoModel.create({
      key: `lesson-videos/${new Types.ObjectId().toString()}`,
      sizeBytes: 1,
      fingerprint: 'test',
      status,
      ...(status === 'ready' ? { contentType: 'video/mp4' } : { uploadId: 'upload-1' }),
    });
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: createdAt.toJSDate(), updatedAt: createdAt.toJSDate() } },
    );
    return doc._id.toString();
  }

  async function attachToLesson(videoId: string): Promise<void> {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.minus({ days: 3 }).toJSDate(),
      durationMin: 60,
      recordings: [
        { title: 'Ссылка', url: 'https://cloud.example/a' },
        { title: 'Файл', videoId },
      ],
    });
  }

  it('старая сирота — удаляется из базы, объект уходит из R2, журнал чист', async () => {
    await makeVideo(OLD);

    const result = await service.removeOrphans(NOW);

    expect(result).toEqual({ removed: 1 });
    await expect(videoModel.countDocuments({})).resolves.toBe(0);
    expect(removedKeys).toHaveLength(1);
    expect(removedKeys[0]).toMatch(/^lesson-videos\//);
    await expect(orphanModel.countDocuments({})).resolves.toBe(0);
  });

  it('свежая сирота (первые сутки — учитель ещё привязывает) остаётся', async () => {
    await makeVideo(NOW.minus({ hours: 23 }));

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 0 });
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('старое видео, на которое ссылается запись занятия, остаётся', async () => {
    const id = await makeVideo(OLD);
    await attachToLesson(id);

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 0 });
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('из двух старых видео уходит только то, на которое ничто не ссылается', async () => {
    const kept = await makeVideo(OLD);
    await makeVideo(OLD);
    await attachToLesson(kept);

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
    const left = await videoModel.find({}, { _id: 1 }).lean();
    expect(left.map((doc) => doc._id.toString())).toEqual([kept]);
  });

  it('загрузка, которая идёт частями, сиротой не считается', async () => {
    await makeVideo(NOW.minus({ days: 2 }), 'uploading');

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 0 });
    await expect(videoModel.countDocuments({})).resolves.toBe(1);
  });

  it('брошенная загрузка старше недели прерывается в R2 и удаляется, свежая остаётся', async () => {
    await makeVideo(NOW.minus({ days: 8 }), 'uploading');
    const fresh = await makeVideo(NOW.minus({ days: 1 }), 'uploading');

    const result = await service.removeOrphans(NOW);

    expect(result.removed).toBe(1);
    expect(abortMultipartUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^lesson-videos\//),
      'upload-1',
      NOW,
    );
    const left = await videoModel.find({}, { _id: 1 }).lean();
    expect(left.map((doc) => doc._id.toString())).toEqual([fresh]);
  });

  it('R2 выключен — шаг ничего не делает', async () => {
    storageOn = false;
    await makeVideo(OLD);
    await makeVideo(NOW.minus({ days: 8 }), 'uploading');

    await expect(service.removeOrphans(NOW)).resolves.toEqual({ removed: 0 });
    await expect(videoModel.countDocuments({})).resolves.toBe(2);
  });
});
