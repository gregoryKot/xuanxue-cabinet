// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): мок модели пропустил бы именно ту ошибку, ради которой этот файл
// существует — `$match` в агрегации не кастует строковые id к `ObjectId`
// сам (my-exam-attempt-summaries.ts, шапка «ЛОВУШКА»), и без явного
// `new Types.ObjectId(...)` результат был бы молча пустым, а не ошибкой.
import { DateTime } from 'luxon';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { aggregateAttemptSummaries } from './my-exam-attempt-summaries';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

describe('aggregateAttemptSummaries', () => {
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

  async function createPublishedItem(): Promise<string> {
    const created = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(created.id, { status: 'published' }, NOW);
    return created.id;
  }

  async function createExam(attemptsAllowed: number): Promise<string> {
    const itemId = await createPublishedItem();
    const created = await ctx.examsService.create(
      { title: 'Экзамен', blocks: [{ itemIds: [itemId] }], attemptsAllowed },
      AUTHOR_ID,
    );
    await ctx.examsService.update(created.id, { status: 'published' });
    return created.id;
  }

  it('без явного ObjectId-каста агрегация ничего не находит', async () => {
    // Регрессия на саму ловушку: аргумент `userId`/`examId` в $match —
    // строка, схема хранит ObjectId. Сравниваем напрямую со строками, минуя
    // aggregateAttemptSummaries, чтобы показать, что без каста Mongo молчит.
    const examId = await createExam(1);
    await ctx.service.start(examId, USER_A, NOW);

    const rowsWithoutCast = await ctx.attemptModel.aggregate([
      { $match: { userId: USER_A, examId: { $in: [examId] } } },
      { $sort: { examId: 1, attemptNo: -1 } },
      {
        $group: {
          _id: '$examId',
          attemptsUsed: { $sum: 1 },
          latest: { $first: '$$ROOT' },
        },
      },
    ]);
    expect(rowsWithoutCast).toEqual([]);

    const withCast = await aggregateAttemptSummaries({
      attemptModel: ctx.attemptModel,
      examIds: [examId],
      userId: USER_A,
    });
    expect(withCast.size).toBe(1);
  });

  it('две формы: три попытки и одна — attemptsUsed и latest по attemptNo, не по порядку вставки', async () => {
    const examWithThree = await createExam(3);
    const examWithOne = await createExam(1);

    const first = await ctx.service.start(examWithThree, USER_A, NOW);
    await ctx.service.submit(first.id, USER_A, NOW);
    const second = await ctx.service.start(examWithThree, USER_A, NOW);
    await ctx.service.submit(second.id, USER_A, NOW);
    const third = await ctx.service.start(examWithThree, USER_A, NOW);

    // Раздвигаем attemptNo и порядок физической вставки: первая вставленная
    // попытка получает наибольший attemptNo, третья вставленная — наименьший.
    // Если бы агрегация полагалась на порядок Mongo, а не на явный
    // `$sort { attemptNo: -1 }`, «свежей» оказалась бы не та попытка. Через
    // временное значение — уникальный индекс (examId, userId, attemptNo) не
    // даёт присвоить занятое число напрямую.
    await ctx.attemptModel.updateOne({ _id: third.id }, { $set: { attemptNo: 99 } });
    await ctx.attemptModel.updateOne({ _id: first.id }, { $set: { attemptNo: 3 } });
    await ctx.attemptModel.updateOne({ _id: third.id }, { $set: { attemptNo: 1 } });

    const solo = await ctx.service.start(examWithOne, USER_A, NOW);

    const summaries = await aggregateAttemptSummaries({
      attemptModel: ctx.attemptModel,
      examIds: [examWithThree, examWithOne],
      userId: USER_A,
    });

    expect(summaries.get(examWithThree)?.attemptsUsed).toBe(3);
    expect(summaries.get(examWithThree)?.latest._id.toString()).toBe(first.id);
    expect(summaries.get(examWithThree)?.latest.attemptNo).toBe(3);

    expect(summaries.get(examWithOne)?.attemptsUsed).toBe(1);
    expect(summaries.get(examWithOne)?.latest._id.toString()).toBe(solo.id);
  });

  it('попытки другого ученика на ту же форму в выборку не попадают', async () => {
    const examId = await createExam(1);
    await ctx.service.start(examId, USER_B, NOW);

    const summaries = await aggregateAttemptSummaries({
      attemptModel: ctx.attemptModel,
      examIds: [examId],
      userId: USER_A,
    });

    expect(summaries.has(examId)).toBe(false);
  });

  it('пустой список examIds — пустая карта без запроса в базу', async () => {
    const spy = jest.spyOn(ctx.attemptModel, 'aggregate');

    const summaries = await aggregateAttemptSummaries({
      attemptModel: ctx.attemptModel,
      examIds: [],
      userId: USER_A,
    });

    expect(summaries).toEqual(new Map());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('форма без единой попытки ученика — её нет в карте', async () => {
    const examWithAttempt = await createExam(1);
    const examWithoutAttempt = await createExam(1);
    await ctx.service.start(examWithAttempt, USER_A, NOW);

    const summaries = await aggregateAttemptSummaries({
      attemptModel: ctx.attemptModel,
      examIds: [examWithAttempt, examWithoutAttempt],
      userId: USER_A,
    });

    expect(summaries.has(examWithAttempt)).toBe(true);
    expect(summaries.has(examWithoutAttempt)).toBe(false);
  });
});
