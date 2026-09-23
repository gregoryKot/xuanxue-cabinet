// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): владение по `userId` в фильтре запроса и ленивое закрытие по
// дедлайну — на гонке и на условном апдейте моком легко соврать. Образец —
// exam-attempt-lifecycle.spec.ts.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { NotFoundError } from '../common/errors';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { loadOwnAttempt } from './exam-attempt-load-own';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';

const EXAM_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const OTHER_USER_ID = '507f1f77bcf86cd799439013';
const STARTED_AT = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('loadOwnAttempt', () => {
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
    return doc._id.toString();
  }

  it('своя попытка — возвращается', async () => {
    const id = await seed();

    const found = await loadOwnAttempt({
      model,
      attemptId: id,
      userId: USER_ID,
      now: STARTED_AT,
    });

    expect(found._id.toString()).toBe(id);
    expect(found.status).toBe('in_progress');
  });

  it('чужой userId — NotFoundError, не 403 (SECURITY §3)', async () => {
    const id = await seed();

    await expect(
      loadOwnAttempt({ model, attemptId: id, userId: OTHER_USER_ID, now: STARTED_AT }),
    ).rejects.toThrow(NotFoundError);
  });

  it('невалидный ObjectId — NotFoundError', async () => {
    await expect(
      loadOwnAttempt({ model, attemptId: 'не-id', userId: USER_ID, now: STARTED_AT }),
    ).rejects.toThrow(NotFoundError);
  });

  it('просроченная in_progress закрывается лениво: submitted, expired true, onClose зовётся один раз', async () => {
    const id = await seed({ deadlineAt: STARTED_AT.plus({ minutes: 30 }).toJSDate() });
    const onClose = jest.fn();

    const found = await loadOwnAttempt({
      model,
      attemptId: id,
      userId: USER_ID,
      now: STARTED_AT.plus({ minutes: 45 }),
      onClose,
    });

    expect(found.status).toBe('submitted');
    expect(found.expired).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    const stored = await model.findById(id).lean();
    expect(stored?.status).toBe('submitted');
    expect(stored?.expired).toBe(true);
  });
});
