// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// общий путь удаления попытки со всем, что на ней висит. Им идут и повтор
// просроченной попытки (ADR-0131), и срок хранения (ADR-0153) — здесь то, что
// у обоих одно: условие удаления, состав каскада, дочистка после сбоя.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import {
  AUTHOR_ID,
  GRADER_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { deleteAttemptWithDependents } from './exam-attempt-cascade';

const NOW = DateTime.utc(2026, 9, 29, 12, 0, 0);

describe('deleteAttemptWithDependents', () => {
  let ctx: AttemptsTestContext;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  const models = () => ({
    attemptModel: ctx.attemptModel,
    gradingModel: ctx.gradingModel,
    mediaModel: ctx.mediaModel,
    notificationModel: ctx.notificationModel,
  });

  async function insertAttemptWithDependents(status: 'submitted' | 'graded') {
    const _id = new Types.ObjectId();
    const userId = new Types.ObjectId(USER_A);
    await ctx.attemptModel.collection.insertOne({
      _id,
      examId: new Types.ObjectId(),
      examTitle: 'Экзамен',
      userId,
      attemptNo: 1,
      status,
      blocks: '[]',
      answers: '[]',
      startedAt: NOW.toJSDate(),
      expired: false,
    });
    await ctx.gradingModel.create({
      attemptId: _id,
      examId: new Types.ObjectId(),
      userId,
      graderId: new Types.ObjectId(GRADER_ID),
      outcome: 'passed',
      gradedAt: NOW.toJSDate(),
    });
    await ctx.mediaModel.create({
      attemptId: _id,
      userId,
      kind: 'manual',
      receivedAt: NOW.toJSDate(),
    });
    await ctx.notificationModel.create({
      userId: AUTHOR_ID,
      kind: 'attempt_submitted',
      attemptId: _id.toString(),
      readAt: null,
      dismissedAt: null,
    });
    return _id;
  }

  // [попытка, оценка, видео, уведомление] — сколько документов осталось.
  async function countAll(attemptId: Types.ObjectId): Promise<number[]> {
    return [
      await ctx.attemptModel.countDocuments({ _id: attemptId }),
      await ctx.gradingModel.countDocuments({ attemptId }),
      await ctx.mediaModel.countDocuments({ attemptId }),
      await ctx.notificationModel.countDocuments({ attemptId: attemptId.toString() }),
    ];
  }

  it('подошла под условие — уходят попытка, оценка, видео и уведомление, вызов возвращает true', async () => {
    const id = await insertAttemptWithDependents('graded');
    const other = await insertAttemptWithDependents('graded');

    await expect(
      deleteAttemptWithDependents(models(), id, { status: 'graded' }),
    ).resolves.toBe(true);

    await expect(countAll(id)).resolves.toEqual([0, 0, 0, 0]);
    // Чужая попытка со своим хвостом не задета.
    await expect(countAll(other)).resolves.toEqual([1, 1, 1, 1]);
  });

  it('не подошла под условие (проверили в эту секунду) — ничего не трогает, историю оценки не рвёт', async () => {
    const id = await insertAttemptWithDependents('graded');

    await expect(
      deleteAttemptWithDependents(models(), id, { status: 'submitted', expired: true }),
    ).resolves.toBe(false);

    await expect(countAll(id)).resolves.toEqual([1, 1, 1, 1]);
  });

  it('попытки уже нет, а хвосты остались (сбой между удалениями) — дочищает, возвращает false', async () => {
    const id = await insertAttemptWithDependents('submitted');
    await ctx.attemptModel.deleteOne({ _id: id });

    await expect(
      deleteAttemptWithDependents(models(), id, { status: 'submitted' }),
    ).resolves.toBe(false);

    await expect(countAll(id)).resolves.toEqual([0, 0, 0, 0]);
  });
});
