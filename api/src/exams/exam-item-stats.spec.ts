// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { AttemptAnswerDto } from '@xuanxue/shared';
import {
  accumulateAttemptStats,
  computeExamItemStats,
  computeStrugglingCount,
  type AttemptStatsInput,
} from './exam-item-stats';
import type { AttemptBlockRecord } from './exam-attempt.schema';
import type { ExamItemOptionRecord } from './exam-item.schema';

const SINGLE_OPTIONS: ExamItemOptionRecord[] = [
  { id: 'o1', text: 'верно', correct: true },
  { id: 'o2', text: 'неверно', correct: false },
];

function attempt(
  itemId: string,
  options: ExamItemOptionRecord[],
  answers: AttemptAnswerDto[],
): AttemptStatsInput {
  const blocks: AttemptBlockRecord[] = [
    {
      id: 'b1',
      title: 'Блок',
      required: false,
      questions: [
        {
          itemId,
          version: 1,
          kind: options.length > 0 ? 'single' : 'text',
          prompt: 'вопрос',
          options,
        },
      ],
    },
  ];
  return { blocks, answers };
}

describe('computeExamItemStats', () => {
  it('несколько попыток, часть ответов верных — askedCount/correctCount/доля', () => {
    const attempts = [
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o1'] }]),
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o2'] }]),
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o1'] }]),
    ];
    const acc = accumulateAttemptStats(attempts);

    const stats = computeExamItemStats('i1', 'single', SINGLE_OPTIONS, acc);

    expect(stats.askedCount).toBe(3);
    expect(stats.correctCount).toBe(2);
    expect(stats.correctRate).toBeCloseTo(2 / 3);
    expect(stats.options).toEqual([
      { id: 'o1', text: 'верно', correct: true, chosenCount: 2 },
      { id: 'o2', text: 'неверно', correct: false, chosenCount: 1 },
    ]);
  });

  it('лишний выбранный вариант вместе с верным — не засчитывается как полностью верный', () => {
    const multi: ExamItemOptionRecord[] = [
      { id: 'o1', text: 'верно', correct: true },
      { id: 'o2', text: 'тоже верно', correct: true },
      { id: 'o3', text: 'неверно', correct: false },
    ];
    const attempts = [attempt('i1', multi, [{ itemId: 'i1', optionIds: ['o1', 'o3'] }])];
    const acc = accumulateAttemptStats(attempts);

    const stats = computeExamItemStats('i1', 'multiple', multi, acc);

    expect(stats.askedCount).toBe(1);
    expect(stats.correctCount).toBe(0);
  });

  it('вопрос без вариантов — correctCount/correctRate/options не выдуманы', () => {
    const attempts = [attempt('i1', [], [{ itemId: 'i1', text: 'свободный ответ' }])];
    const acc = accumulateAttemptStats(attempts);

    const stats = computeExamItemStats('i1', 'text', [], acc);

    expect(stats.askedCount).toBe(1);
    expect(stats.correctCount).toBeUndefined();
    expect(stats.correctRate).toBeUndefined();
    expect(stats.options).toBeUndefined();
  });

  it('вопрос, которого ещё не было ни в одной попытке — askedCount 0, доля не выдумана', () => {
    const acc = accumulateAttemptStats([]);

    const stats = computeExamItemStats('never-asked', 'single', SINGLE_OPTIONS, acc);

    expect(stats.askedCount).toBe(0);
    expect(stats.correctCount).toBe(0);
    expect(stats.correctRate).toBeUndefined();
    expect(stats.options).toEqual([
      { id: 'o1', text: 'верно', correct: true, chosenCount: 0 },
      { id: 'o2', text: 'неверно', correct: false, chosenCount: 0 },
    ]);
  });

  it('ответ не дан (сдал попытку, не выбрав вариант) — считается заданным и неверным', () => {
    const attempts = [attempt('i1', SINGLE_OPTIONS, [])];
    const acc = accumulateAttemptStats(attempts);

    const stats = computeExamItemStats('i1', 'single', SINGLE_OPTIONS, acc);

    expect(stats.askedCount).toBe(1);
    expect(stats.correctCount).toBe(0);
  });
});

describe('computeStrugglingCount', () => {
  it('чаще половины ошибаются — считается', () => {
    const attempts = [
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o2'] }]),
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o2'] }]),
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o1'] }]),
    ];
    const acc = accumulateAttemptStats(attempts);

    expect(computeStrugglingCount([{ id: 'i1', options: SINGLE_OPTIONS }], acc)).toBe(1);
  });

  it('ровно половина верно — ещё не «чаще половины», не считается', () => {
    const attempts = [
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o1'] }]),
      attempt('i1', SINGLE_OPTIONS, [{ itemId: 'i1', optionIds: ['o2'] }]),
    ];
    const acc = accumulateAttemptStats(attempts);

    expect(computeStrugglingCount([{ id: 'i1', options: SINGLE_OPTIONS }], acc)).toBe(0);
  });

  it('вопрос без вариантов — не считается, даже если бы совпал по id', () => {
    const attempts = [attempt('i1', [], [])];
    const acc = accumulateAttemptStats(attempts);

    expect(computeStrugglingCount([{ id: 'i1', options: [] }], acc)).toBe(0);
  });

  it('вопрос, который ни разу не задавали — не считается', () => {
    const acc = accumulateAttemptStats([]);

    expect(
      computeStrugglingCount([{ id: 'never-asked', options: SINGLE_OPTIONS }], acc),
    ).toBe(0);
  });

  it('пустая база (ни вопросов, ни попыток) — 0, не мусор', () => {
    const acc = accumulateAttemptStats([]);

    expect(computeStrugglingCount([], acc)).toBe(0);
  });
});
