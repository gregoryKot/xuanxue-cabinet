// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { ExamBlockDto, ExamItemDto } from '@xuanxue/shared';
import { checkOptionAnswer } from './exam-attempt-review';
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
  return { id: 'b1', title: 'Блок', shuffle: false, ...overrides };
}

/** Один вызов на все тесты ниже — перемешивание вариантов выключено, если
 * тест не просит обратного. */
function build(
  blocks: ExamBlockDto[],
  itemsById: ReadonlyMap<string, ExamItemDto>,
  random: () => number,
  shuffleOptions = false,
) {
  return buildAttemptBlocks({ blocks, itemsById, shuffleOptions, random });
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

/** Вопрос с тремя вариантами — на нём проверяются и перемешивание вариантов,
 * и безразличие автопроверки к их порядку. */
function singleChoiceItem(): ReadonlyMap<string, ExamItemDto> {
  return new Map([
    [
      'i1',
      item({
        id: 'i1',
        kind: 'single',
        options: [
          { id: 'o1', text: 'первый', correct: true },
          { id: 'o2', text: 'второй', correct: false },
          { id: 'o3', text: 'третий', correct: false },
        ],
      }),
    ],
  ]);
}

describe('buildAttemptBlocks', () => {
  it('без shuffle — порядок вопросов в блоке как в itemIds', () => {
    const itemsById = new Map([
      ['i1', item({ id: 'i1' })],
      ['i2', item({ id: 'i2' })],
    ]);
    const blocks = [block({ itemIds: ['i2', 'i1'], shuffle: false })];

    const snapshot = build(blocks, itemsById, () => 0);

    expect(snapshot[0]?.questions.map((q) => q.itemId)).toEqual(['i2', 'i1']);
  });

  it('с shuffle — порядок вопросов перемешан заданной случайностью', () => {
    const itemsById = new Map([
      ['i1', item({ id: 'i1' })],
      ['i2', item({ id: 'i2' })],
      ['i3', item({ id: 'i3' })],
    ]);
    const blocks = [block({ itemIds: ['i1', 'i2', 'i3'], shuffle: true })];

    const snapshot = build(blocks, itemsById, fixedSequence([0.9, 0.1, 0.5]));

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

    const snapshot = build(blocks, itemsById, () => 0);

    const question = snapshot[0]?.questions[0];
    expect(question?.criteria).toBe('колено уходит внутрь — незачёт');
    expect(question?.options).toEqual([
      { id: 'o1', text: 'верно', correct: true },
      { id: 'o2', text: 'неверно', correct: false },
    ]);
  });

  it('shuffleOptions — варианты внутри вопроса перемешаны, набор id тот же', () => {
    const blocks = [block({ itemIds: ['i1'] })];

    const snapshot = build(
      blocks,
      singleChoiceItem(),
      fixedSequence([0.9, 0.1, 0.5]),
      true,
    );

    const options = snapshot[0]?.questions[0]?.options ?? [];
    expect(options.map((o) => o.id)).toEqual(['o2', 'o3', 'o1']);
    expect([...options].map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3']);
  });

  // ADR-0033: автопроверка идёт по `option.id` (exam-attempt-review.ts), а не
  // по месту в списке — перемешивание не должно менять ни одной цифры.
  it('автопроверка после перемешивания вариантов даёт тот же результат', () => {
    const blocks = [block({ itemIds: ['i1'] })];
    const answer = ['o1'];

    const plain = build(blocks, singleChoiceItem(), () => 0);
    const shuffled = build(
      blocks,
      singleChoiceItem(),
      fixedSequence([0.9, 0.1, 0.5]),
      true,
    );

    expect(checkOptionAnswer(shuffled[0]?.questions[0]?.options ?? [], answer)).toEqual(
      checkOptionAnswer(plain[0]?.questions[0]?.options ?? [], answer),
    );
  });

  it('вопрос блока не найден среди загруженных — программная ошибка (не DomainError)', () => {
    const blocks = [block({ itemIds: ['missing'] })];

    expect(() => build(blocks, new Map(), () => 0)).toThrow('не найден');
  });
});
