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

  it('карточка проверки до оценки: есть рубрика и критерии вопроса, grading отсутствует', async () => {
    const itemId = await createPublishedItem({ criteria: 'смотреть на осанку' });
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);

    const review = await ctx.gradingsService.getReview(started.id);

    expect(review.grading).toBeUndefined();
    expect(review.rubric.length).toBeGreaterThan(0); // DEFAULT_RUBRIC подставлен при создании
    expect(review.blocks[0]?.questions[0]?.criteria).toBe('смотреть на осанку');
  });

  it('проверить попытку в работе (не сдана) — отказ, оценка не создаётся', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);
    const exam = await ctx.examsService.getById(examId);
    const criterion = exam.rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');

    await expect(
      ctx.gradingsService.grade(
        started.id,
        GRADER_ID,
        { criteria: [{ id: criterion.id, score: 1 }], outcome: 'passed' },
        NOW,
      ),
    ).rejects.toThrow('ученик её не сдал');
    await expect(ctx.gradingModel.countDocuments({})).resolves.toBe(0);
  });

  it('оценка сданной попытки: read-after-write, попытка становится graded', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);
    const exam = await ctx.examsService.getById(examId);
    const criterion = exam.rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');

    const graded = await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      {
        criteria: [{ id: criterion.id, score: criterion.maxScore, comment: 'отлично' }],
        comment: 'Общий комментарий учителя',
        outcome: 'passed',
      },
      NOW,
    );

    expect(graded.outcome).toBe('passed');
    expect(graded.criteria).toEqual([
      {
        id: criterion.id,
        title: criterion.title,
        maxScore: criterion.maxScore,
        score: criterion.maxScore,
        comment: 'отлично',
      },
    ]);

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
    const exam = await ctx.examsService.getById(examId);
    const criterion = exam.rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');

    await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      { criteria: [{ id: criterion.id, score: 1 }], outcome: 'needs_work' },
      NOW,
    );
    const second = await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      { criteria: [{ id: criterion.id, score: criterion.maxScore }], outcome: 'passed' },
      NOW.plus({ minutes: 5 }),
    );

    expect(second.outcome).toBe('passed');
    await expect(
      ctx.gradingModel.countDocuments({ attemptId: started.id }),
    ).resolves.toBe(1);
  });

  it('неизвестный критерий рубрики — 400, оценка не создаётся', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);

    await expect(
      ctx.gradingsService.grade(
        started.id,
        GRADER_ID,
        { criteria: [{ id: '507f1f77bcf86cd799439099', score: 1 }], outcome: 'passed' },
        NOW,
      ),
    ).rejects.toThrow('не найден');
    await expect(ctx.gradingModel.countDocuments({})).resolves.toBe(0);
  });

  it('правка рубрики экзамена после проверки не меняет уже выставленную оценку', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);
    const exam = await ctx.examsService.getById(examId);
    const criterion = exam.rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');

    const graded = await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      {
        criteria: [{ id: criterion.id, score: 2, comment: 'снимок до правки' }],
        outcome: 'passed',
      },
      NOW,
    );

    // Учитель переписывает рубрику — уже выставленная оценка не едет следом
    // (ADR-0022: оценка хранит свой снимок, а не ссылку на текущую рубрику).
    await ctx.examsService.update(examId, {
      rubric: [{ title: 'Новый критерий после проверки', maxScore: 9 }],
    });

    const review = await ctx.gradingsService.getReview(started.id);
    expect(review.grading?.criteria).toEqual(graded.criteria);
    expect(review.grading?.criteria[0]?.title).toBe(criterion.title);
    // Текущая рубрика формы в карточке — уже новая, отдельно от снимка оценки.
    expect(review.rubric[0]?.title).toBe('Новый критерий после проверки');
  });

  it('оценка одной попытки не задевает оценку другой', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam(itemId);
    const attemptA = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(attemptA.id, USER_A, NOW);
    const attemptB = await ctx.service.start(examId, USER_B, NOW);
    await ctx.service.submit(attemptB.id, USER_B, NOW);
    const exam = await ctx.examsService.getById(examId);
    const criterion = exam.rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');

    await ctx.gradingsService.grade(
      attemptA.id,
      GRADER_ID,
      { criteria: [{ id: criterion.id, score: 1 }], outcome: 'failed' },
      NOW,
    );

    const reviewB = await ctx.gradingsService.getReview(attemptB.id);
    expect(reviewB.grading).toBeUndefined();
    expect(reviewB.status).toBe('submitted'); // не задета оценкой А
  });
});
