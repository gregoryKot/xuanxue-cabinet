// Хвост уборки видео-сирот против настоящей Mongo (mongodb-memory-server, не мок —
// CLAUDE.md «Тесты»): кого оставить решает множество ссылок, кого убрать — вызов
// removeNow (журнал ключа раньше удаления из R2, ADR-0079).
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { ExamVideoRecord, ExamVideoSchema } from '../exam-videos/exam-video.schema';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { removeUnreferencedVideos } from './video-orphans-remove';

const NOW = DateTime.utc(2026, 10, 10, 12, 0, 0);

describe('removeUnreferencedVideos', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ExamVideoRecord>;
  let removeNow: jest.Mock;
  let orphans: StorageOrphansService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    removeNow = jest.fn().mockResolvedValue(undefined);
    orphans = { removeNow } as unknown as StorageOrphansService;
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function makeVideo(): Promise<{ _id: Types.ObjectId; key: string }> {
    const key = `exam-videos/${new Types.ObjectId().toString()}`;
    const doc = await model.create({
      key,
      sizeBytes: 1,
      fingerprint: 'x',
      status: 'ready',
    });
    return { _id: doc._id, key };
  }

  it('убирает тех, на кого никто не ссылается, и только их', async () => {
    const used = await makeVideo();
    const lone = await makeVideo();

    const removed = await removeUnreferencedVideos(
      { model, orphans },
      [used, lone],
      new Set([used._id.toString()]),
      NOW,
    );

    expect(removed).toBe(1);
    expect(removeNow).toHaveBeenCalledTimes(1);
    expect(removeNow).toHaveBeenCalledWith(lone.key, NOW);
    const left = await model.find({}, { _id: 1 }).lean();
    expect(left.map((doc) => doc._id.toString())).toEqual([used._id.toString()]);
  });

  it('все кандидаты используются — ничего не трогает', async () => {
    const used = await makeVideo();

    const removed = await removeUnreferencedVideos(
      { model, orphans },
      [used],
      new Set([used._id.toString()]),
      NOW,
    );

    expect(removed).toBe(0);
    expect(removeNow).not.toHaveBeenCalled();
    await expect(model.countDocuments({})).resolves.toBe(1);
  });

  it('отказ хранилища на одном ключе не удаляет запись из базы', async () => {
    const lone = await makeVideo();
    removeNow.mockRejectedValueOnce(new Error('R2 недоступен'));

    await expect(
      removeUnreferencedVideos({ model, orphans }, [lone], new Set(), NOW),
    ).rejects.toThrow('R2 недоступен');

    await expect(model.countDocuments({})).resolves.toBe(1);
  });
});
