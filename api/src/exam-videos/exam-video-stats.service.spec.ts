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
    await expect(service.getSummary()).resolves.toEqual({ count: 0, totalBytes: 0 });
  });

  it('несколько видео — count и totalBytes суммируются', async () => {
    await videoModel.create(seedDoc(1_000_000));
    await videoModel.create(seedDoc(2_500_000));

    await expect(service.getSummary()).resolves.toEqual({
      count: 2,
      totalBytes: 3_500_000,
    });
  });
});
