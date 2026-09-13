// Уведомление ученику «работу проверили» (exam_result, слой 4.7, PLAN §11) —
// отдельный файл от exam-gradings.service.spec.ts (файл-лимит спеков,
// CLAUDE.md «Файлы»). Против настоящей Mongo (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import {
  AUTHOR_ID,
  GRADER_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 9, 13, 9, 0, 0);

describe('ExamGradingsService — уведомление exam_result', () => {
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

  async function submittedAttempt() {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'x' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Экзамен по третьей форме', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    const started = await ctx.service.start(exam.id, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);
    const criterion = (await ctx.examsService.getById(exam.id)).rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');
    return { attemptId: started.id, examId: exam.id, criterionId: criterion.id };
  }

  it('оценка сохранена — уведомление ученику ушло с верным контекстом', async () => {
    const { attemptId, examId, criterionId } = await submittedAttempt();

    await ctx.gradingsService.grade(
      attemptId,
      GRADER_ID,
      {
        criteria: [{ id: criterionId, score: 1 }],
        comment: 'Поправьте стойку',
        outcome: 'needs_work',
      },
      NOW,
    );

    expect(ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(1);
    const [context] = ctx.examNotifier.notifyExamGraded.mock.calls[0] ?? [];
    expect(context).toMatchObject({
      attemptId,
      examId,
      examTitle: 'Экзамен по третьей форме',
      userId: USER_A,
      outcome: 'needs_work',
      comment: 'Поправьте стойку',
    });
  });

  it('переписанная оценка — уведомление уходит снова (ученик должен узнать)', async () => {
    const { attemptId, criterionId } = await submittedAttempt();

    await ctx.gradingsService.grade(
      attemptId,
      GRADER_ID,
      { criteria: [{ id: criterionId, score: 1 }], outcome: 'needs_work' },
      NOW,
    );
    await ctx.gradingsService.grade(
      attemptId,
      GRADER_ID,
      { criteria: [{ id: criterionId, score: 5 }], outcome: 'passed' },
      NOW.plus({ minutes: 5 }),
    );

    expect(ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(2);
    const [, secondCall] = ctx.examNotifier.notifyExamGraded.mock.calls;
    expect(secondCall?.[0]).toMatchObject({ outcome: 'passed' });
  });

  it('оценка не сохранена (попытка в работе) — уведомление не уходит', async () => {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'x' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'т', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    const started = await ctx.service.start(exam.id, USER_A, NOW);
    const criterion = (await ctx.examsService.getById(exam.id)).rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');

    await expect(
      ctx.gradingsService.grade(
        started.id,
        GRADER_ID,
        { criteria: [{ id: criterion.id, score: 1 }], outcome: 'passed' },
        NOW,
      ),
    ).rejects.toThrow();

    expect(ctx.examNotifier.notifyExamGraded).not.toHaveBeenCalled();
  });
});
