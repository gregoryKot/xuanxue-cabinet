// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): пустая
// база — честный ноль, считаются только status: 'ready'.
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { AnswerVideoStatsService } from './answer-video-stats.service';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';

describe('AnswerVideoStatsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<AnswerVideoRecord>;
  let service: AnswerVideoStatsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<AnswerVideoRecord>(
      AnswerVideoRecord.name,
      AnswerVideoSchema,
    );
    service = new AnswerVideoStatsService(videoModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await videoModel.deleteMany({});
  });

  it('пустая база — честный ноль, не 0/NaN мусор', async () => {
    await expect(service.getSummary()).resolves.toEqual({ count: 0, totalBytes: 0 });
  });

  it('считает только ready, не uploading', async () => {
    await videoModel.create([
      {
        userId: new Types.ObjectId(),
        attemptId: new Types.ObjectId(),
        itemId: new Types.ObjectId(),
        key: 'answer-videos/a',
        sizeBytes: 100,
        fingerprint: '100:1',
        status: 'ready',
      },
      {
        userId: new Types.ObjectId(),
        attemptId: new Types.ObjectId(),
        itemId: new Types.ObjectId(),
        key: 'answer-videos/b',
        sizeBytes: 9000,
        fingerprint: '9000:1',
        status: 'uploading',
      },
    ]);

    await expect(service.getSummary()).resolves.toEqual({ count: 1, totalBytes: 100 });
  });
});
