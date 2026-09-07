// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// апсерт по chatId, вытеснение старого ожидания, фильтр по expiresAt.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BotSessionRecord, BotSessionSchema } from './bot-session.schema';
import { BotSessionService } from './bot-session.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('BotSessionService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<BotSessionRecord>;
  let service: BotSessionService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<BotSessionRecord>(BotSessionRecord.name, BotSessionSchema);
    await model.syncIndexes();
    service = new BotSessionService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('startTopicWait → get возвращает kind/lessonId', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    const session = await service.get(111, NOW);

    expect(session?.kind).toBe('topic');
    expect(session?.lessonId.toString()).toBe(lessonId);
  });

  it('новое ожидание вытесняет старое — один документ на чат', async () => {
    const first = new Types.ObjectId().toString();
    const second = new Types.ObjectId().toString();
    await service.startTopicWait(111, first, NOW);
    await service.startTopicWait(111, second, NOW);

    const session = await service.get(111, NOW);

    expect(session?.lessonId.toString()).toBe(second);
    await expect(model.countDocuments({ chatId: 111 })).resolves.toBe(1);
  });

  it('истёкшее ожидание — get не возвращает', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    const session = await service.get(111, NOW.plus({ minutes: 11 }));

    expect(session).toBeNull();
  });

  it('clear убирает ожидание', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    await service.clear(111);

    expect(await service.get(111, NOW)).toBeNull();
  });

  it('нет ожидания для чата — get возвращает null', async () => {
    expect(await service.get(999, NOW)).toBeNull();
  });

  it('hasExpired — false, если ожидания для чата не было вовсе', async () => {
    expect(await service.hasExpired(999, NOW)).toBe(false);
  });

  it('hasExpired — false, пока ожидание ещё активно', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    expect(await service.hasExpired(111, NOW)).toBe(false);
  });

  it('hasExpired — true, когда expiresAt уже в прошлом', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    expect(await service.hasExpired(111, NOW.plus({ minutes: 11 }))).toBe(true);
  });
});
