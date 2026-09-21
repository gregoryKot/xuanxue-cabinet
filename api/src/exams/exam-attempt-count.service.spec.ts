// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): countDocuments — реальный запрос по examId, попытки заводятся
// через настоящий ExamAttemptsService.start(), как их создаёт ученик, а не
// вставкой в базу мимо снимка и шифрования. Общий подъём сервисов —
// exam-attempts.test-support.ts (тот же приём, что у
// exam-item-stats.service.spec.ts).
import { DateTime } from 'luxon';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { ExamAttemptCountService } from './exam-attempt-count.service';

const NOW = DateTime.utc(2026, 9, 21, 9, 0, 0);

describe('ExamAttemptCountService', () => {
  let ctx: AttemptsTestContext;
  let countService: ExamAttemptCountService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    countService = new ExamAttemptCountService(ctx.attemptModel);
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function createPublishedExam(): Promise<string> {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму «пэнбу»' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Экзамен', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return exam.id;
  }

  it('на чистой базе — total: 0', async () => {
    const missingId = '507f1f77bcf86cd799439099';

    await expect(countService.countByExam(missingId)).resolves.toEqual({ total: 0 });
  });

  it('две попытки по экзамену и одна по другому — считает только свой экзамен', async () => {
    const examId = await createPublishedExam();
    const otherExamId = await createPublishedExam();

    // Разные ученики — иначе второй start() того же экзамена упрётся в
    // attemptsAllowed по умолчанию (1) и вернёт первую попытку, а не заведёт вторую.
    await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.start(examId, USER_B, NOW);
    await ctx.service.start(otherExamId, USER_A, NOW);

    await expect(countService.countByExam(examId)).resolves.toEqual({ total: 2 });
  });
});
