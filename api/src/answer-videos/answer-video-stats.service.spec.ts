// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): пустая
// база — честный ноль, считаются только status: 'ready'. `pendingItemIds`
// (аудит 2026-10-01 F34) — живая загрузка в списке, брошенная и готовая — нет.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  ANSWER_VIDEO_UPLOAD_LIVENESS_MIN,
  AnswerVideoStatsService,
} from './answer-video-stats.service';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';

const NOW = DateTime.utc(2026, 10, 2, 9, 0, 0);

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

  describe('pendingItemIds (F34)', () => {
    const attemptId = new Types.ObjectId();
    const itemId = new Types.ObjectId();

    // Сырая вставка, не `create`: timestamps выставили бы `updatedAt` часами
    // машины, а тесту нужен детерминированный возраст загрузки (CLAUDE.md
    // «Детерминизм»).
    async function insertVideo(fields: {
      status: 'uploading' | 'ready';
      updatedAt: DateTime;
      attemptId?: Types.ObjectId;
      itemId?: Types.ObjectId;
    }): Promise<void> {
      await videoModel.collection.insertOne({
        userId: new Types.ObjectId(),
        attemptId: fields.attemptId ?? attemptId,
        itemId: fields.itemId ?? itemId,
        key: `answer-videos/${new Types.ObjectId().toString()}`,
        sizeBytes: 100,
        fingerprint: '100:1',
        status: fields.status,
        parts: [],
        createdAt: fields.updatedAt.toJSDate(),
        updatedAt: fields.updatedAt.toJSDate(),
      });
    }

    it('пустая база — пустой список', async () => {
      await expect(service.pendingItemIds(attemptId.toString(), NOW)).resolves.toEqual(
        [],
      );
    });

    it('свежая uploading — itemId в списке, один раз даже при двух загрузках', async () => {
      await insertVideo({ status: 'uploading', updatedAt: NOW.minus({ minutes: 1 }) });
      await insertVideo({ status: 'uploading', updatedAt: NOW.minus({ minutes: 2 }) });

      await expect(service.pendingItemIds(attemptId.toString(), NOW)).resolves.toEqual([
        itemId.toString(),
      ]);
    });

    it('uploading старше окна живости — брошена, в списке нет', async () => {
      await insertVideo({
        status: 'uploading',
        updatedAt: NOW.minus({ minutes: ANSWER_VIDEO_UPLOAD_LIVENESS_MIN + 1 }),
      });

      await expect(service.pendingItemIds(attemptId.toString(), NOW)).resolves.toEqual(
        [],
      );
    });

    it('ready — уже не грузится, в списке нет', async () => {
      await insertVideo({ status: 'ready', updatedAt: NOW });

      await expect(service.pendingItemIds(attemptId.toString(), NOW)).resolves.toEqual(
        [],
      );
    });

    it('загрузка чужой попытки — не в списке этой', async () => {
      await insertVideo({
        status: 'uploading',
        updatedAt: NOW,
        attemptId: new Types.ObjectId(),
      });

      await expect(service.pendingItemIds(attemptId.toString(), NOW)).resolves.toEqual(
        [],
      );
    });
  });
});
