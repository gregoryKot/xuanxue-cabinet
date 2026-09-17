// Против настоящей Mongo (CLAUDE.md «Тесты») — дедлайн считает сервер, Luxon
// (ТЗ 4.4, п.7): запрос после дедлайна отклоняется, попытка закрывается
// `submitted`/`expired: true`. Обязателен тест на переход летнего времени
// Asia/Jerusalem (CLAUDE.md «Время») — длительность не должна поехать.
import { DateTime } from 'luxon';
import { decryptAttempt, type RawLeanExamAttempt } from './exam-attempt.mapper';
import {
  AUTHOR_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

describe('ExamAttemptsService — дедлайн', () => {
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

  async function startTimedAttempt(timeLimitMin: number, startedAt: DateTime) {
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
    return ctx.service.start(exam.id, USER_A, startedAt);
  }

  it('старт с лимитом времени — deadlineAt = startedAt + timeLimitMin', async () => {
    const started = await startTimedAttempt(30, NOW);

    expect(started.deadlineAt).toBe(NOW.plus({ minutes: 30 }).toUTC().toISO());
    expect(started.expired).toBe(false);
  });

  it('форма без лимита времени — deadlineAt не задан', async () => {
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

    const started = await ctx.service.start(exam.id, USER_A, NOW);

    expect(started.deadlineAt).toBeUndefined();
  });

  it('сохранение после дедлайна — отклонено, попытка закрыта expired', async () => {
    const started = await startTimedAttempt(30, NOW);

    await expect(
      ctx.service.saveAnswers(
        started.id,
        USER_A,
        {
          answers: [
            { itemId: started.blocks[0]?.questions[0]?.itemId ?? '', text: 'поздно' },
          ],
        },
        NOW.plus({ minutes: 31 }),
      ),
    ).rejects.toThrow('Время экзамена вышло');

    const raw = await ctx.attemptModel.findById(started.id).lean<RawLeanExamAttempt>();
    if (!raw) throw new Error('попытка не найдена');
    expect(raw.status).toBe('submitted');
    expect(raw.expired).toBe(true);
    expect(decryptAttempt(raw).answers).toEqual([]); // ответ не сохранён
  });

  it('сдача после дедлайна — тот же отказ «время вышло», не тихий успех', async () => {
    const started = await startTimedAttempt(30, NOW);

    await expect(
      ctx.service.submit(started.id, USER_A, NOW.plus({ minutes: 45 })),
    ).rejects.toThrow('Время экзамена вышло');

    const raw = await ctx.attemptModel.findById(started.id).lean();
    expect(raw?.status).toBe('submitted');
    expect(raw?.expired).toBe(true);
  });

  it('сдача точно до дедлайна — успех, expired: false', async () => {
    const started = await startTimedAttempt(30, NOW);

    const submitted = await ctx.service.submit(
      started.id,
      USER_A,
      NOW.plus({ minutes: 29 }),
    );

    expect(submitted.status).toBe('submitted');
    expect(submitted.expired).toBe(false);
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // любого кода, который считает «когда». Старт до перехода (IDT, UTC+3),
  // дедлайн — через 10 часов, уже после перехода (IST, UTC+2, последнее
  // воскресенье октября). Длительность должна остаться ровно 600 минут в
  // реальном времени, а не «10 часов по местным часам» (которых на самом
  // деле 11 — час прибавился при переводе стрелок назад).
  it('переход на зимнее время Asia/Jerusalem — попытка длится ровно timeLimitMin минут', async () => {
    const startedAt = DateTime.fromObject(
      { year: 2026, month: 10, day: 24, hour: 20, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    const afterTransition = DateTime.fromObject(
      { year: 2026, month: 10, day: 25, hour: 5, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    // Сам тест пересекает переход — иначе он ничего не проверяет.
    expect(startedAt.offset).not.toBe(afterTransition.offset);

    const started = await startTimedAttempt(600, startedAt);
    const deadlineAt = DateTime.fromISO(started.deadlineAt ?? '', { zone: 'utc' });
    const startedAtUtc = DateTime.fromISO(started.startedAt, { zone: 'utc' });

    expect(deadlineAt.diff(startedAtUtc, 'minutes').minutes).toBe(600);

    // До дедлайна (в реальном времени) — можно сохранить ответ.
    const beforeDeadline = deadlineAt.minus({ minutes: 1 });
    await expect(
      ctx.service.saveAnswers(
        started.id,
        USER_A,
        {
          answers: [
            { itemId: started.blocks[0]?.questions[0]?.itemId ?? '', text: 'успел' },
          ],
        },
        beforeDeadline,
      ),
    ).resolves.toMatchObject({ status: 'in_progress' });

    // После дедлайна — уже нет, независимо от того, что «по местным часам»
    // прошло на час больше видимых 600 минут.
    await expect(
      ctx.service.submit(started.id, USER_A, deadlineAt.plus({ minutes: 1 })),
    ).rejects.toThrow('Время экзамена вышло');
  });
  // Второй переход того же пояса — на летнее время (стрелки вперёд, ночь
  // короче на час): 10 часов лимита «по местным часам» выглядят как 9 —
  // сервер всё равно считает ровно 600 минут реального времени.
  it('переход на летнее время Asia/Jerusalem — попытка длится ровно timeLimitMin минут', async () => {
    const startedAt = DateTime.fromObject(
      { year: 2026, month: 3, day: 26, hour: 20, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    const afterTransition = DateTime.fromObject(
      { year: 2026, month: 3, day: 27, hour: 6, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(startedAt.offset).not.toBe(afterTransition.offset);
    expect(afterTransition.offset - startedAt.offset).toBe(60);

    const started = await startTimedAttempt(600, startedAt);
    const deadlineAt = DateTime.fromISO(started.deadlineAt ?? '', { zone: 'utc' });
    const startedAtUtc = DateTime.fromISO(started.startedAt, { zone: 'utc' });
    expect(deadlineAt.diff(startedAtUtc, 'minutes').minutes).toBe(600);
    // По местным часам дедлайн — 07:00, а не 06:00: час «исчез» при переводе.
    expect(deadlineAt.setZone('Asia/Jerusalem').toFormat('HH:mm')).toBe('07:00');

    await expect(
      ctx.service.submit(started.id, USER_A, deadlineAt.minus({ minutes: 1 })),
    ).resolves.toMatchObject({ status: 'submitted', expired: false });
  });
});
