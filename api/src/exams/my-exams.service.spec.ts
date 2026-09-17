// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): только опубликованные формы, положение ученика по каждой
// (attemptsUsed/lastAttempt), владение по userId, дедлайн закрывается тем же
// правилом, что у /attempts (ТЗ docs/PLAN.md §11, «GET /api/me/exams»).
import { DateTime } from 'luxon';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { MyExamsService } from './my-exams.service';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

describe('MyExamsService', () => {
  let ctx: AttemptsTestContext;
  let service: MyExamsService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    service = new MyExamsService(
      ctx.examModel,
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.examNotifier,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function createPublishedItem(): Promise<string> {
    const created = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(created.id, { status: 'published' }, NOW);
    return created.id;
  }

  async function createExam(options: {
    itemId: string;
    published?: boolean;
    timeLimitMin?: number;
    attemptsAllowed?: number;
  }): Promise<string> {
    const created = await ctx.examsService.create(
      {
        title: 'Экзамен',
        blocks: [{ itemIds: [options.itemId] }],
        timeLimitMin: options.timeLimitMin,
        attemptsAllowed: options.attemptsAllowed,
      },
      AUTHOR_ID,
    );
    if (options.published !== false) {
      await ctx.examsService.update(created.id, { status: 'published' });
    }
    return created.id;
  }

  it('черновик формы не отдаётся, опубликованная — да', async () => {
    const itemId = await createPublishedItem();
    await createExam({ itemId, published: false });
    const publishedId = await createExam({ itemId });

    const list = await service.list({}, USER_A, NOW);

    expect(list.map((e) => e.id)).toEqual([publishedId]);
  });

  it('ученик ещё не начинал — attemptsUsed 0, lastAttempt отсутствует', async () => {
    const itemId = await createPublishedItem();
    await createExam({ itemId });

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.attemptsUsed).toBe(0);
    expect(list[0]?.lastAttempt).toBeUndefined();
  });

  it('старт попытки → в /me/exams видно attemptsUsed и статус последней', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.attemptsUsed).toBe(1);
    expect(list[0]?.lastAttempt).toEqual({ id: started.id, status: 'in_progress' });
  });

  it('чужая попытка не влияет: у Б своё положение, отдельное от А', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    await ctx.service.start(examId, USER_A, NOW);

    const listB = await service.list({}, USER_B, NOW);

    expect(listB[0]?.attemptsUsed).toBe(0);
    expect(listB[0]?.lastAttempt).toBeUndefined();
  });

  it('вторая попытка по той же форме — lastAttempt и attemptsUsed про свежую, не про первую', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId, attemptsAllowed: 2 });
    const first = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(first.id, USER_A, NOW);
    const second = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.attemptsUsed).toBe(2);
    expect(list[0]?.lastAttempt).toEqual({ id: second.id, status: 'in_progress' });
  });

  it('дедлайн истёк — последняя попытка видна уже submitted/expired, не in_progress', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId, timeLimitMin: 10 });
    await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW.plus({ minutes: 11 }));

    expect(list[0]?.lastAttempt?.status).toBe('submitted');
  });

  it('limit ограничивает список опубликованных форм', async () => {
    const itemId = await createPublishedItem();
    await createExam({ itemId });
    await createExam({ itemId });
    await createExam({ itemId });

    const list = await service.list({ limit: 2 }, USER_A, NOW);

    expect(list).toHaveLength(2);
  });

  it('пустая база — пустой список, не ошибка', async () => {
    const list = await service.list({}, USER_A, NOW);
    expect(list).toEqual([]);
  });

  // Слой 4.6: результат появляется в /me/exams, когда учитель его выставил —
  // баллы по критериям рубрики ученику можно (его собственная работа),
  // критерии проверки вопроса этот сервис не читает вовсе.
  it('оценка выставлена — lastAttempt несёт outcome, comment и баллы по критериям', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);
    const exam = await ctx.examsService.getById(examId);
    const criterion = exam.rubric[0];
    if (!criterion) throw new Error('ожидался критерий по умолчанию');
    await ctx.gradingsService.grade(
      started.id,
      '507f1f77bcf86cd799439014',
      {
        criteria: [{ id: criterion.id, score: criterion.maxScore, comment: 'чётко' }],
        comment: 'Общий комментарий учителя',
        outcome: 'passed',
      },
      NOW,
    );

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'graded',
      outcome: 'passed',
      comment: 'Общий комментарий учителя',
      criteria: [
        {
          id: criterion.id,
          title: criterion.title,
          maxScore: criterion.maxScore,
          score: criterion.maxScore,
          comment: 'чётко',
        },
      ],
    });
  });

  it('оценка ещё не выставлена — lastAttempt без outcome/comment/criteria', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.lastAttempt?.outcome).toBeUndefined();
    expect(list[0]?.lastAttempt).toEqual({ id: started.id, status: 'in_progress' });
  });
});
