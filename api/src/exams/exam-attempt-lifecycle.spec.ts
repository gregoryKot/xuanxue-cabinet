// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): условный апдейт по дедлайну и поиск попытки «в работе» — на
// уникальном индексе и на гонке параллельных запросов моком легко соврать.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { closeIfExpiredAttempt, findInProgressAttempt } from './exam-attempt-lifecycle';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';

const EXAM_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const STARTED_AT = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('exam-attempt-lifecycle', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ExamAttemptRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function seed(overrides: Partial<ExamAttemptRecord> = {}) {
    const doc = await model.create({
      examId: EXAM_ID,
      examTitle: 'т',
      userId: USER_ID,
      attemptNo: 1,
      status: 'in_progress',
      blocks: '[]',
      answers: '[]',
      startedAt: STARTED_AT.toJSDate(),
      ...overrides,
    });
    return doc._id;
  }

  describe('findInProgressAttempt', () => {
    it('нет попыток — null', async () => {
      await expect(findInProgressAttempt(model, EXAM_ID, USER_ID)).resolves.toBeNull();
    });

    it('есть попытка в работе — находит её', async () => {
      await seed();

      const found = await findInProgressAttempt(model, EXAM_ID, USER_ID);

      expect(found?.status).toBe('in_progress');
    });

    it('попытка уже сдана — не находит (не in_progress)', async () => {
      await seed({ status: 'submitted', submittedAt: STARTED_AT.toJSDate() });

      await expect(findInProgressAttempt(model, EXAM_ID, USER_ID)).resolves.toBeNull();
    });
  });

  describe('closeIfExpiredAttempt', () => {
    async function loadAttempt() {
      const id = await seed({
        deadlineAt: STARTED_AT.plus({ minutes: 30 }).toJSDate(),
      });
      const found = await findInProgressAttempt(model, EXAM_ID, USER_ID);
      if (!found) throw new Error('попытка не найдена сразу после сидирования');
      return { id, found };
    }

    it('до дедлайна — не трогает попытку', async () => {
      const { found } = await loadAttempt();

      const result = await closeIfExpiredAttempt(
        model,
        found,
        STARTED_AT.plus({ minutes: 10 }),
      );

      expect(result.status).toBe('in_progress');
      expect(result.expired).toBe(false);
    });

    it('после дедлайна — закрывает как submitted с expired: true', async () => {
      const { id, found } = await loadAttempt();

      const result = await closeIfExpiredAttempt(
        model,
        found,
        STARTED_AT.plus({ minutes: 45 }),
      );

      expect(result.status).toBe('submitted');
      expect(result.expired).toBe(true);
      expect(result.submittedAt?.toISOString()).toBe(
        STARTED_AT.plus({ minutes: 30 }).toJSDate().toISOString(),
      );

      const stored = await model.findById(id).lean();
      expect(stored?.status).toBe('submitted');
      expect(stored?.expired).toBe(true);
    });

    it('без deadlineAt (нет лимита времени) — не трогает попытку', async () => {
      const id = await seed();
      const found = await findInProgressAttempt(model, EXAM_ID, USER_ID);
      if (!found) throw new Error('попытка не найдена сразу после сидирования');

      const result = await closeIfExpiredAttempt(
        model,
        found,
        STARTED_AT.plus({ years: 1 }),
      );

      expect(result.status).toBe('in_progress');
      await expect(model.findById(id).lean()).resolves.toMatchObject({
        status: 'in_progress',
      });
    });

    it('уже закрыта конкурентным запросом — перечитывает актуальное состояние, не бросает', async () => {
      const { found } = await loadAttempt();
      const now = STARTED_AT.plus({ minutes: 45 });
      // Имитация гонки: конкурент уже закрыл документ до вызова этой функции.
      await model.updateOne(
        { _id: found._id },
        { $set: { status: 'submitted', expired: true, submittedAt: now.toJSDate() } },
      );

      const result = await closeIfExpiredAttempt(model, found, now);

      expect(result.status).toBe('submitted');
      expect(result.expired).toBe(true);
    });

    it('документ уже не существует вовсе — возвращает переданный attempt как есть, не бросает', async () => {
      const { found } = await loadAttempt();
      await model.deleteOne({ _id: found._id });

      const result = await closeIfExpiredAttempt(
        model,
        found,
        STARTED_AT.plus({ minutes: 45 }),
      );

      expect(result).toBe(found);
    });
  });
});
