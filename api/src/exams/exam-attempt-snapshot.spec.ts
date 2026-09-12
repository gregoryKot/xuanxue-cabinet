// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { ExamBlockDto, ExamItemDto } from '@xuanxue/shared';
import { buildAttemptBlocks, shuffleOnce } from './exam-attempt-snapshot';

function fixedSequence(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i];
    i += 1;
    if (value === undefined) throw new Error('fixedSequence: значений не хватило');
    return value;
  };
}

function item(overrides: Partial<ExamItemDto> & { id: string }): ExamItemDto {
  return {
    kind: 'text',
    prompt: `вопрос ${overrides.id}`,
    options: [],
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function block(overrides: Partial<ExamBlockDto> & { itemIds: string[] }): ExamBlockDto {
  return { id: 'b1', title: 'Блок', required: false, shuffle: false, ...overrides };
}

describe('shuffleOnce', () => {
  it('переставляет элементы по заданной последовательности случайных чисел', () => {
    // Ключи 0.9/0.1/0.5 у a/b/c сортируются как b(0.1) < c(0.5) < a(0.9).
    const result = shuffleOnce(['a', 'b', 'c'], fixedSequence([0.9, 0.1, 0.5]));

    expect(result).toEqual(['b', 'c', 'a']);
  });

  it('не меняет исходный массив', () => {
    const source = ['a', 'b', 'c'];

    shuffleOnce(source, fixedSequence([0.9, 0.1, 0.5]));

    expect(source).toEqual(['a', 'b', 'c']);
  });

  it('одна и та же последовательность случайных чисел — один и тот же порядок (два чтения попытки)', () => {
    const first = shuffleOnce(['a', 'b', 'c'], fixedSequence([0.2, 0.8, 0.1]));
    const second = shuffleOnce(['a', 'b', 'c'], fixedSequence([0.2, 0.8, 0.1]));

    expect(first).toEqual(second);
  });
});

describe('buildAttemptBlocks', () => {
  it('без shuffle — порядок вопросов в блоке как в itemIds', () => {
    const itemsById = new Map([
      ['i1', item({ id: 'i1' })],
      ['i2', item({ id: 'i2' })],
    ]);
    const blocks = [block({ itemIds: ['i2', 'i1'], shuffle: false })];

    const snapshot = buildAttemptBlocks(blocks, itemsById, () => 0);

    expect(snapshot[0]?.questions.map((q) => q.itemId)).toEqual(['i2', 'i1']);
  });

  it('с shuffle — порядок вопросов перемешан заданной случайностью', () => {
    const itemsById = new Map([
      ['i1', item({ id: 'i1' })],
      ['i2', item({ id: 'i2' })],
      ['i3', item({ id: 'i3' })],
    ]);
    const blocks = [block({ itemIds: ['i1', 'i2', 'i3'], shuffle: true })];

    const snapshot = buildAttemptBlocks(
      blocks,
      itemsById,
      fixedSequence([0.9, 0.1, 0.5]),
    );

    expect(snapshot[0]?.questions.map((q) => q.itemId)).toEqual(['i2', 'i3', 'i1']);
  });

  it('снимок несёт correct у варианта и criteria вопроса — обязательный инвариант ТЗ 4.4', () => {
    const itemsById = new Map([
      [
        'i1',
        item({
          id: 'i1',
          kind: 'single',
          criteria: 'колено уходит внутрь — незачёт',
          options: [
            { id: 'o1', text: 'верно', correct: true },
            { id: 'o2', text: 'неверно', correct: false },
          ],
        }),
      ],
    ]);
    const blocks = [block({ itemIds: ['i1'] })];

    const snapshot = buildAttemptBlocks(blocks, itemsById, () => 0);

    const question = snapshot[0]?.questions[0];
    expect(question?.criteria).toBe('колено уходит внутрь — незачёт');
    expect(question?.options).toEqual([
      { id: 'o1', text: 'верно', correct: true },
      { id: 'o2', text: 'неверно', correct: false },
    ]);
  });

  it('вопрос блока не найден среди загруженных — программная ошибка (не DomainError)', () => {
    const blocks = [block({ itemIds: ['missing'] })];

    expect(() => buildAttemptBlocks(blocks, new Map(), () => 0)).toThrow('не найден');
  });
});
