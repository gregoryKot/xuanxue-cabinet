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
    expect(session?.lessonId?.toString()).toBe(lessonId);
  });

  it('startRecordingWait → get возвращает kind/lessonId', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startRecordingWait(111, lessonId, NOW);

    const session = await service.get(111, NOW);

    expect(session?.kind).toBe('recording');
    expect(session?.lessonId?.toString()).toBe(lessonId);
  });

  it('recording-ожидание не истекает за 10 минут (12 часов, дольше темы)', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startRecordingWait(111, lessonId, NOW);

    const session = await service.get(111, NOW.plus({ minutes: 11 }));

    expect(session).not.toBeNull();
  });

  it('новое ожидание вытесняет старое — один документ на чат', async () => {
    const first = new Types.ObjectId().toString();
    const second = new Types.ObjectId().toString();
    await service.startTopicWait(111, first, NOW);
    await service.startRecordingWait(111, second, NOW);

    const session = await service.get(111, NOW);

    expect(session?.kind).toBe('recording');
    expect(session?.lessonId?.toString()).toBe(second);
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

  it('hasExpired — null, если ожидания для чата не было вовсе', async () => {
    expect(await service.hasExpired(999, NOW)).toBeNull();
  });

  it('hasExpired — null, пока ожидание ещё активно', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    expect(await service.hasExpired(111, NOW)).toBeNull();
  });

  it('hasExpired — kind "topic", когда истёкшее ожидание было темой', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startTopicWait(111, lessonId, NOW);

    expect(await service.hasExpired(111, NOW.plus({ minutes: 11 }))).toBe('topic');
  });

  it('hasExpired — kind "recording", когда истёкшее ожидание было записью', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startRecordingWait(111, lessonId, NOW);

    expect(await service.hasExpired(111, NOW.plus({ hours: 13 }))).toBe('recording');
  });

  it('clearIfLesson — закрывает ожидание, если оно про это занятие', async () => {
    const lessonId = new Types.ObjectId().toString();
    await service.startRecordingWait(111, lessonId, NOW);

    await service.clearIfLesson(111, lessonId);

    expect(await service.get(111, NOW)).toBeNull();
  });

  it('startExamMediaWait → get возвращает kind/attemptId, открыт любому chatId', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW);

    const session = await service.get(555, NOW);

    expect(session?.kind).toBe('examMedia');
    expect(session?.attemptId?.toString()).toBe(attemptId);
    expect(session?.lessonId).toBeUndefined();
  });

  it('examMedia-ожидание не истекает за час (12 часов, как «Запись?»)', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW);

    const session = await service.get(555, NOW.plus({ hours: 1 }));

    expect(session).not.toBeNull();
  });

  it('examMedia-ожидание вытесняет ожидание темы того же чата', async () => {
    const lessonId = new Types.ObjectId().toString();
    const attemptId = new Types.ObjectId().toString();
    await service.startTopicWait(555, lessonId, NOW);

    await service.startExamMediaWait(555, attemptId, NOW);

    const session = await service.get(555, NOW);
    expect(session?.kind).toBe('examMedia');
    expect(session?.attemptId?.toString()).toBe(attemptId);
    await expect(model.countDocuments({ chatId: 555 })).resolves.toBe(1);
  });

  it('clearIfLesson — не трогает ожидание другого занятия', async () => {
    const lessonId = new Types.ObjectId().toString();
    const otherLessonId = new Types.ObjectId().toString();
    await service.startRecordingWait(111, lessonId, NOW);

    await service.clearIfLesson(111, otherLessonId);

    const session = await service.get(111, NOW);
    expect(session?.lessonId?.toString()).toBe(lessonId);
  });

  it('startExamMediaWait с номером вопроса — get возвращает questionIndex', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW, 2);

    const session = await service.get(555, NOW);

    expect(session?.kind).toBe('examMedia');
    expect(session?.questionIndex).toBe(2);
  });

  it('startExamMediaWait без номера вопроса стирает номер прошлого захода в поток бота', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW, 3);

    await service.startExamMediaWait(555, attemptId, NOW);

    const session = await service.get(555, NOW);
    expect(session?.questionIndex).toBeNull();
  });

  // ADR-0037: itemId — тем же приёмом, что questionIndex выше.
  it('startExamMediaWait с itemId (deep link с вопросом) — get возвращает itemId', async () => {
    const attemptId = new Types.ObjectId().toString();
    const itemId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW, undefined, itemId);

    const session = await service.get(555, NOW);

    expect(session?.itemId?.toString()).toBe(itemId);
  });

  it('startExamMediaWait без itemId стирает itemId прошлого захода', async () => {
    const attemptId = new Types.ObjectId().toString();
    const itemId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW, 0, itemId);

    await service.startExamMediaWait(555, attemptId, NOW);

    const session = await service.get(555, NOW);
    expect(session?.itemId).toBeNull();
  });

  it('startExamTextWait → get возвращает kind/attemptId/questionIndex', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamTextWait(555, attemptId, 1, NOW);

    const session = await service.get(555, NOW);

    expect(session?.kind).toBe('examText');
    expect(session?.attemptId?.toString()).toBe(attemptId);
    expect(session?.questionIndex).toBe(1);
  });

  it('examText-ожидание вытесняет examMedia того же чата — один документ', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW, 0);

    await service.startExamTextWait(555, attemptId, 1, NOW);

    const session = await service.get(555, NOW);
    expect(session?.kind).toBe('examText');
    await expect(model.countDocuments({ chatId: 555 })).resolves.toBe(1);
  });
  // PLAN.md §12: упавший хендлер не оставляет ожидание навсегда — TTL
  // (EXAM_ANSWER_WAIT_HOURS, exam-answer-wait.ts) закрывает и examText, и
  // examMedia; get() перестаёт отдавать ожидание по expiresAt сам, не
  // дожидаясь TTL-монитора Mongo, hasExpired() помнит, какое оно было.
  it('examText-ожидание истекает через 12 часов — get null, hasExpired отдаёт kind', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamTextWait(555, attemptId, 0, NOW);

    await expect(
      service.get(555, NOW.plus({ hours: 11, minutes: 59 })),
    ).resolves.not.toBeNull();
    await expect(
      service.get(555, NOW.plus({ hours: 12, minutes: 1 })),
    ).resolves.toBeNull();
    await expect(
      service.hasExpired(555, NOW.plus({ hours: 12, minutes: 1 })),
    ).resolves.toBe('examText');
  });

  it('examMedia-ожидание истекает через 12 часов — get null, hasExpired отдаёт kind', async () => {
    const attemptId = new Types.ObjectId().toString();
    await service.startExamMediaWait(555, attemptId, NOW, 0);

    await expect(
      service.get(555, NOW.plus({ hours: 12, minutes: 1 })),
    ).resolves.toBeNull();
    await expect(
      service.hasExpired(555, NOW.plus({ hours: 12, minutes: 1 })),
    ).resolves.toBe('examMedia');
  });
});
