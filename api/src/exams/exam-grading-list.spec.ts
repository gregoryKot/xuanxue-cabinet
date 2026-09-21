// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): у файла не было своего теста вовсе, покрывался только косвенно
// через ExamAttemptsService.list() — оттуда никогда не прилетает пустой
// список или мусорный id (attemptId в списке — всегда валидный ObjectId
// настоящей попытки), поэтому ранний выход при пустом списке и отсев
// невалидных ObjectId оставались непокрытыми (coverage-храповик api,
// просадка веток на PR #351 «проверенные работы — отдельным списком»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { GradingOutcome } from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';
import { listGradingsForAttempts } from './exam-grading-list';

const GRADED_AT = DateTime.utc(2026, 9, 20, 12, 0, 0).toJSDate();

describe('listGradingsForAttempts', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let gradingModel: Model<ExamGradingRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    gradingModel = connection.model<ExamGradingRecord>(
      ExamGradingRecord.name,
      ExamGradingSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await gradingModel.deleteMany({});
  });

  // graderId/examId/userId здесь не важны самой функции (она их даже не
  // выбирает проекцией) — заполняются, потому что схема требует их как
  // обязательные поля документа.
  async function createGrading(
    attemptId: Types.ObjectId,
    outcome: GradingOutcome = 'passed',
  ): Promise<void> {
    await gradingModel.create({
      attemptId,
      examId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      graderId: new Types.ObjectId(),
      outcome,
      gradedAt: GRADED_AT,
    });
  }

  it('пустой список id — пустая карта, без запроса к базе', async () => {
    const findSpy = jest.spyOn(gradingModel, 'find');

    const result = await listGradingsForAttempts(gradingModel, []);

    expect(result.size).toBe(0);
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it('только мусорные id (не ObjectId) — пустая карта, без запроса к базе', async () => {
    const findSpy = jest.spyOn(gradingModel, 'find');

    const result = await listGradingsForAttempts(gradingModel, ['не id', '12345']);

    expect(result.size).toBe(0);
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it('мусорный attemptId рядом с валидным — отсеян, не падает, в карте только валидный', async () => {
    const gradedAttemptId = new Types.ObjectId();
    await createGrading(gradedAttemptId);

    const result = await listGradingsForAttempts(gradingModel, [
      gradedAttemptId.toString(),
      'мусор-не-objectid',
    ]);

    expect(result.size).toBe(1);
    expect(result.has(gradedAttemptId.toString())).toBe(true);
  });

  it('валидный attemptId без оценки — в карте его нет', async () => {
    const ungradedAttemptId = new Types.ObjectId();

    const result = await listGradingsForAttempts(gradingModel, [
      ungradedAttemptId.toString(),
    ]);

    expect(result.size).toBe(0);
    expect(result.has(ungradedAttemptId.toString())).toBe(false);
  });

  it('оценка найдена — outcome и gradedAt (ISO UTC) под attemptId', async () => {
    const attemptId = new Types.ObjectId();
    await createGrading(attemptId, 'needs_work');

    const result = await listGradingsForAttempts(gradingModel, [attemptId.toString()]);

    expect(result.get(attemptId.toString())).toEqual({
      outcome: 'needs_work',
      gradedAt: DateTime.fromJSDate(GRADED_AT).toUTC().toISO(),
    });
  });

  it('несколько попыток — одним запросом ($in), не по документу', async () => {
    const gradedIds = [new Types.ObjectId(), new Types.ObjectId()];
    await Promise.all(gradedIds.map((id) => createGrading(id)));
    const ungradedId = new Types.ObjectId();
    const findSpy = jest.spyOn(gradingModel, 'find');

    const result = await listGradingsForAttempts(gradingModel, [
      ...gradedIds.map((id) => id.toString()),
      ungradedId.toString(),
    ]);

    expect(result.size).toBe(2);
    expect(findSpy).toHaveBeenCalledTimes(1);
    findSpy.mockRestore();
  });
});
