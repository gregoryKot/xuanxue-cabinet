// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// очередь проверки (аудит 2026-10-01 F33) читает попытку проекцией без
// снимка — важно проверить сам запрос: что `examTitle` расшифрован, что
// `blocks`/`answers` не приходят, что фильтр статуса и оценка работают так
// же, как у полного списка.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { ExamAttemptQueueService } from './exam-attempt-queue.service';
import {
  AUTHOR_ID,
  GRADER_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 10, 2, 9, 0, 0);

describe('ExamAttemptQueueService', () => {
  let ctx: AttemptsTestContext;
  let queue: ExamAttemptQueueService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    queue = new ExamAttemptQueueService(
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.examsService,
      ctx.userNamesService,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function startAttempt(userId: string) {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Экзамен по третьей форме', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return ctx.service.start(exam.id, userId, NOW);
  }

  it('сданная работа — строка с именем и расшифрованным названием, без снимка формы', async () => {
    await ctx.userModel.create({
      _id: new Types.ObjectId(USER_A),
      name: 'Ученик Иванов',
      roles: [],
      status: 'active',
    });
    const started = await startAttempt(USER_A);
    await ctx.service.submit(started.id, USER_A, NOW.plus({ minutes: 5 }));

    const rows = await queue.list({ status: 'submitted' });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      id: started.id,
      examTitle: 'Экзамен по третьей форме',
      userName: 'Ученик Иванов',
      status: 'submitted',
      expired: false,
    });
    expect(row).not.toHaveProperty('blocks');
    expect(row).not.toHaveProperty('answers');
    expect(row).not.toHaveProperty('media');
  });

  it('фильтр статуса — попытка в работе не попадает в очередь сданных', async () => {
    await startAttempt(USER_A);

    await expect(queue.list({ status: 'submitted' })).resolves.toEqual([]);
    await expect(queue.list({ status: 'in_progress' })).resolves.toHaveLength(1);
  });

  it('проверенная работа — итог и когда проверено (read-after-write)', async () => {
    const started = await startAttempt(USER_A);
    await ctx.service.submit(started.id, USER_A, NOW.plus({ minutes: 5 }));
    await ctx.gradingsService.grade(
      started.id,
      GRADER_ID,
      { outcome: 'passed' },
      NOW.plus({ minutes: 10 }),
    );

    const rows = await queue.list({ status: 'graded' });

    expect(rows.map((row) => row.id)).toEqual([started.id]);
    expect(rows[0]?.outcome).toBe('passed');
    expect(rows[0]?.gradedAt).toBe(NOW.plus({ minutes: 10 }).toISO());
    await expect(queue.list({ status: 'submitted' })).resolves.toEqual([]);
  });

  it('попытки удалённой формы (ADR-0140) не всплывают', async () => {
    const started = await startAttempt(USER_A);
    await ctx.service.submit(started.id, USER_A, NOW.plus({ minutes: 5 }));
    await ctx.examsService.remove(started.examId, NOW.plus({ minutes: 6 }));

    await expect(queue.list({ status: 'submitted' })).resolves.toEqual([]);
  });
});
