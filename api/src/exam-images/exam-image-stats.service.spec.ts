// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): `$group` агрегации проверяется на реальном драйвере, включая
// пустую коллекцию, где стадия не создаёт ни одной строки.
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamImageStatsService } from './exam-image-stats.service';
import { ExamImageRecord, ExamImageSchema } from './exam-image.schema';

function seedDoc(sizeBytes: number) {
  return {
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
    contentType: 'image/jpeg' as const,
    sizeBytes,
  };
}

describe('ExamImageStatsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let imageModel: Model<ExamImageRecord>;
  let service: ExamImageStatsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name, ExamImageSchema);
    service = new ExamImageStatsService(imageModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await imageModel.deleteMany({});
  });

  it('пустая коллекция — честный ноль, не пропущенная строка агрегации', async () => {
    await expect(service.getSummary()).resolves.toEqual({ count: 0, totalBytes: 0 });
  });

  it('несколько картинок — count и totalBytes суммируются', async () => {
    await imageModel.create(seedDoc(1000));
    await imageModel.create(seedDoc(2500));

    await expect(service.getSummary()).resolves.toEqual({ count: 2, totalBytes: 3500 });
  });
});
