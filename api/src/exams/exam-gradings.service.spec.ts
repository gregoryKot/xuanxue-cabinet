// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): read-after-write (проверка → в /review видна оценка), повторный
// PUT не плодит вторую запись (уникальный индекс attemptId), попытка
// становится graded.
import { DateTime } from 'luxon';
import {
  AUTHOR_ID,
  GRADER_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 9, 13, 9, 0, 0);

describe('ExamGradingsService', () => {
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

  async function createPublishedItem(overrides: Record<string, unknown> = {}) {
    const created = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'исходная формулировка', ...overrides },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(created.id, { status: 'published' }, NOW);
    return created.id;
  }

  async function createPublishedExam(itemId: string) {
    const created = await ctx.examsService.create(
      { title: 'Экзамен по третьей форме', blocks: [{ itemIds: [itemId] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(created.id, { status: 'published' });
    return created.id;
  }

  it('карточка проверки до оценки: есть критерии вопроса, grading отсутствует', async () => {
    const itemId = await createPublishedItem({ criteria: 'смотреть на осанку' });
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);

    const review = await ctx.gradingsService.getReview(started.id);

    expect(review.grading).toBeUndefined();
    expect(review.blocks[0]?.questions[0]?.criteria).toBe('смотреть на осанку');
  });

  it('проверить попытку в работе (не сдана) — отказ, оценка не создаётся', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);

    await expect(
      ctx.gradingsService.grade(started.id, GRADER_ID, { outcome: 'passed' }, NOW),
    ).rejects.toThrow('ученик её не сдал');
    await expect(ctx.gradingModel.countDocuments({})).resolves.toBe(0);
  });

  it('оценка сданной попытки: read-after-write, попытка становится graded', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);

    const graded = await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      { comment: 'Общий комментарий учителя', outcome: 'passed' },
      NOW,
    );

    expect(graded.outcome).toBe('passed');
    expect(graded.comment).toBe('Общий комментарий учителя');

    const review = await ctx.gradingsService.getReview(started.id);
    expect(review.grading?.outcome).toBe('passed');
    expect(review.status).toBe('graded');

    const attemptAfter = await ctx.attemptModel.findById(started.id).lean();
    expect(attemptAfter?.status).toBe('graded');
  });

  it('повторный PUT переписывает оценку, не плодит вторую запись', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);

    await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      { outcome: 'needs_work' },
      NOW,
    );
    const second = await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      { outcome: 'passed' },
      NOW.plus({ minutes: 5 }),
    );

    expect(second.outcome).toBe('passed');
    await expect(
      ctx.gradingModel.countDocuments({ attemptId: started.id }),
    ).resolves.toBe(1);
  });

  it('оценка одной попытки не задевает оценку другой', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const attemptA = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(attemptA.id, USER_A, NOW);
    const attemptB = await ctx.service.start(examId, USER_B, NOW);
    await ctx.service.submit(attemptB.id, USER_B, NOW);

    await ctx.gradingsService.grade(attemptA.id, GRADER_ID, { outcome: 'failed' }, NOW);

    const reviewB = await ctx.gradingsService.getReview(attemptB.id);
    expect(reviewB.grading).toBeUndefined();
    expect(reviewB.status).toBe('submitted'); // не задета оценкой А
  });
});
