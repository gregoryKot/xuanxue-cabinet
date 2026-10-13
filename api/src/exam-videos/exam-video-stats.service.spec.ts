// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты») — тот же образец, что exam-image-stats.service.spec.ts.
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

function seedDoc(sizeBytes: number) {
  return {
    key: `exam-videos/${sizeBytes}`,
    contentType: 'video/mp4' as const,
    sizeBytes,
    status: 'ready' as const,
    fingerprint: `test:${sizeBytes}`,
  };
}

describe('ExamVideoStatsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let service: ExamVideoStatsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    service = new ExamVideoStatsService(videoModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await videoModel.deleteMany({});
  });

  it('пустая коллекция — честный ноль, не пропущенная строка агрегации', async () => {
    await expect(service.getSummary()).resolves.toEqual({
      count: 0,
      totalBytes: 0,
      withoutPosterCount: 0,
    });
  });

  // ADR-0165: недогруженное видео никто ещё не смотрел — в число не входит.
  it('видео, которое ещё грузится частями, в число не входит', async () => {
    await videoModel.create(seedDoc(1_000_000));
    await videoModel.create({ ...seedDoc(9_000_000), status: 'uploading' });

    await expect(service.getSummary()).resolves.toEqual({
      count: 1,
      totalBytes: 1_000_000,
      withoutPosterCount: 1,
    });
  });

  it('видео без поля status (записано до ADR-0165) считается готовым', async () => {
    await videoModel.collection.insertOne({
      key: 'exam-videos/legacy',
      contentType: 'video/mp4',
      sizeBytes: 700,
    });

    await expect(service.getSummary()).resolves.toEqual({
      count: 1,
      totalBytes: 700,
      withoutPosterCount: 1,
    });
  });

  it('несколько видео — count и totalBytes суммируются', async () => {
    await videoModel.create(seedDoc(1_000_000));
    await videoModel.create(seedDoc(2_500_000));

    await expect(service.getSummary()).resolves.toEqual({
      count: 2,
      totalBytes: 3_500_000,
      withoutPosterCount: 2,
    });
  });

  // ADR-0182: число для кнопки «Снять кадры» — готовые видео без кадра.
  it('withoutPosterCount: видео с кадром, и недогруженное без кадра, не считаются', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1]);
    await videoModel.create({ ...seedDoc(1_000), poster: jpeg });
    await videoModel.create(seedDoc(2_000));
    await videoModel.create(seedDoc(3_000));
    await videoModel.create({ ...seedDoc(9_000), status: 'uploading' });

    await expect(service.getSummary()).resolves.toEqual({
      count: 3,
      totalBytes: 6_000,
      withoutPosterCount: 2,
    });
  });
});
