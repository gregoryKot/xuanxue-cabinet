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
      ctx.seenMarkModel,
      ctx.examNotifier,
      ctx.examsService,
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
      await ctx.examsService.update(created.id, { status: 'published' }, NOW);
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

  it('удалённая форма (ADR-0140) не отдаётся ученику', async () => {
    const itemId = await createPublishedItem();
    const visibleId = await createExam({ itemId });
    const deletedId = await createExam({ itemId });
    await ctx.examsService.remove(deletedId, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list.map((e) => e.id)).toEqual([visibleId]);
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
    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'in_progress',
      expired: false,
    });
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
    expect(list[0]?.lastAttempt).toEqual({
      id: second.id,
      status: 'in_progress',
      expired: false,
    });
  });

  // Решение владельца 2026-09-21 (ADR-0091): кабинет и бот предлагают
  // «Пройти ещё раз» именно по этому полю, не по одному статусу — поэтому
  // здесь и в тесте ниже сравнивается весь lastAttempt, а не только status.
  it('дедлайн истёк — последняя попытка приезжает submitted и expired: true', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId, timeLimitMin: 10 });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW.plus({ minutes: 11 }));

    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'submitted',
      expired: true,
    });
  });

  it('сдана вручную (не по дедлайну) — lastAttempt приезжает с expired: false', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'submitted',
      expired: false,
    });
  });

  // Read-after-write слоя 4.7 (ADR-0122): форма с лимитом — timeLimitMin в
  // ответе, а у идущей попытки deadlineAt = startedAt + timeLimitMin, ISO UTC.
  it('форма с лимитом времени — timeLimitMin и deadlineAt идущей попытки в ответе', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId, timeLimitMin: 40 });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.timeLimitMin).toBe(40);
    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'in_progress',
      expired: false,
      deadlineAt: NOW.plus({ minutes: 40 }).toUTC().toISO(),
    });
  });

  it('форма без лимита времени — ни timeLimitMin, ни deadlineAt в ответе нет', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.timeLimitMin).toBeUndefined();
    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'in_progress',
      expired: false,
    });
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
  // итог и комментарий ученику можно (его собственная работа), критерии
  // проверки вопроса этот сервис не читает вовсе.
  it('оценка выставлена — lastAttempt несёт outcome и comment', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);
    await ctx.gradingsService.grade(
      started.id,
      '507f1f77bcf86cd799439014',
      { comment: 'Общий комментарий учителя', outcome: 'passed' },
      NOW,
    );

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'graded',
      expired: false,
      outcome: 'passed',
      comment: 'Общий комментарий учителя',
    });
  });

  it('оценка ещё не выставлена — lastAttempt без outcome/comment', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const list = await service.list({}, USER_A, NOW);

    expect(list[0]?.lastAttempt?.outcome).toBeUndefined();
    expect(list[0]?.lastAttempt).toEqual({
      id: started.id,
      status: 'in_progress',
      expired: false,
    });
  });

  // F10 (аудит 2026-10-01): список — только published, и это остаётся верным,
  // потому что переход published → archived при идущей попытке закрыт гардом
  // ExamsService (exam-unpublish-guard.ts). Тест фиксирует: если форму всё же
  // архивировали мимо гарда, карточка пропадает — за это отвечает гард, не список.
  it('форма в архиве с идущей попыткой ученика — в списке её нет (переход держит гард)', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    await ctx.service.start(examId, USER_A, NOW);
    await expect(
      ctx.examsService.update(examId, { status: 'archived' }, NOW),
    ).rejects.toThrow('Дождитесь сдачи');
    await ctx.examModel.updateOne({ _id: examId }, { $set: { status: 'archived' } });

    const list = await service.list({}, USER_A, NOW);

    expect(list).toEqual([]);
  });

  // F55: битая последняя попытка не роняет весь /me/exams — форма видна, но
  // без положения ученика по ней (в логе — attemptId).
  it('последняя попытка не расшифровывается — форма в списке без lastAttempt', async () => {
    const itemId = await createPublishedItem();
    const examId = await createExam({ itemId });
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.attemptModel.updateOne({ _id: started.id }, { $set: { answers: 'мусор' } });

    const list = await service.list({}, USER_A, NOW);

    expect(list.map((e) => e.id)).toEqual([examId]);
    expect(list[0]?.lastAttempt).toBeUndefined();
  });
});

// ADR-0129 (отзыв тестировщицы 2026-09-23): счётчик уведомлений гаснет по
// нажатию на карточку, не по старту попытки — markSeen() и поле seen в
// list() проверяются отдельно от остального положения ученика.
describe('MyExamsService — markSeen (ADR-0129)', () => {
  let ctx: AttemptsTestContext;
  let service: MyExamsService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    service = new MyExamsService(
      ctx.examModel,
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.seenMarkModel,
      ctx.examNotifier,
      ctx.examsService,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function createPublishedExam(): Promise<string> {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Экзамен', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' }, NOW);
    return exam.id;
  }

  it('до отметки — seen: false; после markSeen — seen: true (read-after-write)', async () => {
    const examId = await createPublishedExam();
    expect((await service.list({}, USER_A, NOW))[0]?.seen).toBe(false);

    await service.markSeen(examId, USER_A);

    expect((await service.list({}, USER_A, NOW))[0]?.seen).toBe(true);
  });

  it('отметка одного ученика не трогает положение другого', async () => {
    const examId = await createPublishedExam();
    await service.markSeen(examId, USER_A);

    expect((await service.list({}, USER_B, NOW))[0]?.seen).toBe(false);
  });

  it('повторная отметка той же формы — идемпотентна, не падает', async () => {
    const examId = await createPublishedExam();
    await service.markSeen(examId, USER_A);

    await expect(service.markSeen(examId, USER_A)).resolves.toBeUndefined();
  });

  it('черновик формы — отказ, отметка не появляется', async () => {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const draft = await ctx.examsService.create(
      { title: 'Черновик', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );

    await expect(service.markSeen(draft.id, USER_A)).rejects.toThrow();
    expect(await ctx.seenMarkModel.countDocuments({})).toBe(0);
  });

  it('неизвестный id формы — 404, не падает молча', async () => {
    await expect(service.markSeen('507f1f77bcf86cd799439099', USER_A)).rejects.toThrow();
  });

  it('удалённая форма (ADR-0140) — 404, тем же путём, что старт попытки', async () => {
    const examId = await createPublishedExam();
    await ctx.examsService.remove(examId, NOW);

    await expect(service.markSeen(examId, USER_A)).rejects.toThrow();
  });
});
