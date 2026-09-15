// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// шаг тика «дедлайны экзаменов» — единственный путь закрыть попытку ученика,
// который не вернулся в кабинет и не тронул бота после дедлайна (блокер
// аудита 2026-09-15, ТЗ 4.4 п.7). Ровно тот тест, которого не было ни здесь,
// ни в exam-attempts.service.spec.ts, ни в exam-grading.e2e-spec.ts.
import { DateTime } from 'luxon';
import type { UserLean } from '../users/users.service';
import { ExamDeadlineCloseService } from './exam-deadline-close.service';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 9, 15, 12, 0, 0);

const STAFF_USER: UserLean = {
  id: 'staff',
  name: 'Учитель',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

describe('ExamDeadlineCloseService', () => {
  let ctx: AttemptsTestContext;
  let closer: ExamDeadlineCloseService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    closer = new ExamDeadlineCloseService(ctx.attemptModel, ctx.examNotifier);
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function startTimedAttempt(
    userId: string,
    timeLimitMin: number,
    startedAt: DateTime,
  ) {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'x' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, startedAt);
    const exam = await ctx.examsService.create(
      {
        title: 'Экзамен с лимитом времени',
        blocks: [{ itemIds: [item.id] }],
        timeLimitMin,
      },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return ctx.service.start(exam.id, userId, startedAt);
  }

  it('закрывает просроченную попытку и заводит её в очередь проверки — ровно тот случай, где list() с фильтром по статусу её раньше терял', async () => {
    const started = await startTimedAttempt(USER_A, 30, NOW);
    const afterDeadline = NOW.plus({ minutes: 45 });

    const result = await closer.closeDue(afterDeadline);

    expect(result.closed).toBe(1);
    const submittedQueue = await ctx.service.list(
      { status: 'submitted' },
      STAFF_USER,
      afterDeadline,
    );
    expect(submittedQueue.map((a) => a.id)).toEqual([started.id]);
    expect(submittedQueue[0]?.expired).toBe(true);
    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
  });

  it('повторный вызов (второй тик, второй инстанс при деплое) не трогает уже закрытую попытку и не шлёт второе уведомление', async () => {
    const started = await startTimedAttempt(USER_A, 30, NOW);
    const afterDeadline = NOW.plus({ minutes: 45 });

    const first = await closer.closeDue(afterDeadline);
    const second = await closer.closeDue(afterDeadline.plus({ minutes: 1 }));

    expect(first.closed).toBe(1);
    expect(second.closed).toBe(0);
    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
    const raw = await ctx.attemptModel.findById(started.id).lean();
    expect(raw?.status).toBe('submitted');
    expect(raw?.expired).toBe(true);
  });

  it('дедлайн ещё не наступил — попытка остаётся in_progress, шаг её не трогает', async () => {
    await startTimedAttempt(USER_A, 30, NOW);

    const result = await closer.closeDue(NOW.plus({ minutes: 10 }));

    expect(result.closed).toBe(0);
    expect(ctx.examNotifier.notifyAttemptSubmitted).not.toHaveBeenCalled();
  });

  it('попытка без лимита времени (нет deadlineAt) — шаг её не видит', async () => {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'x' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Без лимита', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    await ctx.service.start(exam.id, USER_A, NOW);

    const result = await closer.closeDue(NOW.plus({ years: 1 }));

    expect(result.closed).toBe(0);
  });

  it('уже сданная вручную попытка — шаг её не трогает и не шлёт второе уведомление', async () => {
    const started = await startTimedAttempt(USER_A, 30, NOW);
    await ctx.service.submit(started.id, USER_A, NOW.plus({ minutes: 5 }));
    ctx.examNotifier.notifyAttemptSubmitted.mockClear();

    const result = await closer.closeDue(NOW.plus({ minutes: 45 }));

    expect(result.closed).toBe(0);
    expect(ctx.examNotifier.notifyAttemptSubmitted).not.toHaveBeenCalled();
  });

  it('несколько просроченных попыток за один тик — закрывает и уведомляет по каждой ровно один раз', async () => {
    const first = await startTimedAttempt(USER_A, 30, NOW);
    const second = await startTimedAttempt(USER_B, 30, NOW);

    const result = await closer.closeDue(NOW.plus({ minutes: 45 }));

    expect(result.closed).toBe(2);
    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(2);
    const ids = ctx.examNotifier.notifyAttemptSubmitted.mock.calls.map(
      ([context]) => context.attemptId,
    );
    expect(ids.sort()).toEqual([first.id, second.id].sort());
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // любого кода, который считает «когда» — здесь дедлайн вычислен при старте
  // до перехода (тот же приём, что exam-attempts.time.spec.ts), а тик
  // проверяет его уже после: попытка обязана закрыться по прошествии
  // реальных 600 минут, а не «10 часов по местным часам».
  it('переход на зимнее время Asia/Jerusalem — попытка закрывается ровно после timeLimitMin минут реального времени', async () => {
    const startedAt = DateTime.fromObject(
      { year: 2026, month: 10, day: 24, hour: 20, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    // Сам тест пересекает переход — иначе он ничего не проверяет (тот же
    // приём, что exam-attempts.time.spec.ts).
    const probablyAfterTransition = DateTime.fromObject(
      { year: 2026, month: 10, day: 25, hour: 10, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(startedAt.offset).not.toBe(probablyAfterTransition.offset);

    const started = await startTimedAttempt(USER_A, 600, startedAt);
    const deadlineAt = DateTime.fromISO(started.deadlineAt ?? '', { zone: 'utc' });

    // До дедлайна (в реальном времени) — шаг не трогает попытку, независимо
    // от того, что «по местным часам» прошло больше 600 минут из-за перевода
    // стрелок.
    const beforeDeadline = await closer.closeDue(deadlineAt.minus({ minutes: 1 }));
    expect(beforeDeadline.closed).toBe(0);

    const afterDeadline = await closer.closeDue(deadlineAt.plus({ minutes: 1 }));
    expect(afterDeadline.closed).toBe(1);
    const raw = await ctx.attemptModel.findById(started.id).lean();
    expect(raw?.status).toBe('submitted');
    expect(raw?.expired).toBe(true);
  });
});
