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
    return { attemptId: started.id, examId: exam.id };
  }

  it('оценка сохранена — уведомление ученику ушло с верным контекстом', async () => {
    const { attemptId, examId } = await submittedAttempt();

    await ctx.gradingsService.grade(
      attemptId,
      GRADER_ID,
      { comment: 'Поправьте стойку', outcome: 'needs_work' },
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
    const { attemptId } = await submittedAttempt();

    await ctx.gradingsService.grade(attemptId, GRADER_ID, { outcome: 'needs_work' }, NOW);
    await ctx.gradingsService.grade(
      attemptId,
      GRADER_ID,
      { outcome: 'passed' },
      NOW.plus({ minutes: 5 }),
    );

    expect(ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(2);
    const [, secondCall] = ctx.examNotifier.notifyExamGraded.mock.calls;
    expect(secondCall?.[0]).toMatchObject({ outcome: 'passed' });
  });

  it('повторный идентичный PUT — второго уведомления нет (аудит 2026-09, находка 3)', async () => {
    const { attemptId } = await submittedAttempt();
    const input = { comment: 'Поправьте стойку', outcome: 'needs_work' as const };

    await ctx.gradingsService.grade(attemptId, GRADER_ID, input, NOW);
    // Учитель нажал «Сохранить» ещё раз теми же значениями (ответ не дошёл
    // из-за сети) — запись идемпотентна (тот же attemptId), уведомление
    // повторяться не должно.
    await ctx.gradingsService.grade(
      attemptId,
      GRADER_ID,
      { ...input },
      NOW.plus({ minutes: 1 }),
    );

    expect(ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(1);
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

    await expect(
      ctx.gradingsService.grade(started.id, GRADER_ID, { outcome: 'passed' }, NOW),
    ).rejects.toThrow();

    expect(ctx.examNotifier.notifyExamGraded).not.toHaveBeenCalled();
  });
});
