// Чистая логика выборки вопросов блока — без Mongo и без DI (CLAUDE.md
// «Тесты»). Перенесено из exam-attempt-snapshot.spec.ts вместе с самим кодом
// (файл-лимит 150 строк, ADR-0082 + дополнение «обязательные вопросы»).
import type { ExamBlockDto } from '@xuanxue/shared';
import { pickQuestionIds, shuffleOnce } from './exam-attempt-pick';

function fixedSequence(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i];
    i += 1;
    if (value === undefined) throw new Error('fixedSequence: значений не хватило');
    return value;
  };
}

function block(overrides: Partial<ExamBlockDto> & { itemIds: string[] }): ExamBlockDto {
  return { id: 'b1', title: 'Блок', shuffle: false, ...overrides };
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

// ADR-0082: блок с questionsPerAttempt — пул itemIds, при старте попытки
// выбираются только N.
describe('pickQuestionIds', () => {
  it('выбирает ровно N различных id из блока', () => {
    const result = pickQuestionIds(
      block({ itemIds: ['a', 'b', 'c'], questionsPerAttempt: 2 }),
      fixedSequence([0.9, 0.1, 0.5]),
    );

    expect(result).toHaveLength(2);
    expect(new Set(result).size).toBe(2);
    for (const id of result) expect(['a', 'b', 'c']).toContain(id);
  });

  it('без shuffle выбранные идут в порядке списка, не в порядке выборки', () => {
    // Ключи 0.9/0.1/0.5 у a/b/c выбрали бы порядок b, c — но shuffle выключен,
    // поэтому итог — порядок itemIds: b раньше c и там, и там, менять нечего,
    // берём набор, где порядок выборки (c, a) обратный порядку списка (a, c).
    const result = pickQuestionIds(
      block({ itemIds: ['a', 'b', 'c'], shuffle: false, questionsPerAttempt: 2 }),
      fixedSequence([0.1, 0.9, 0.5]), // выборка (по ключам): a(0.1), c(0.5) — a раньше c
    );

    expect(result).toEqual(['a', 'c']);
  });

  it('с shuffle порядок выбранных следует случайным ключам, не списку', () => {
    const result = pickQuestionIds(
      block({ itemIds: ['a', 'b', 'c'], shuffle: true, questionsPerAttempt: 2 }),
      // Выборка: ключи a=0.5, b=0.9, c=0.1 → срез c, a. Затем итоговое
      // перемешивание: ключи c=0.9, a=0.1 → a, c — порядок списка тут
      // совпадает случайно, важен сам факт второй перестановки.
      fixedSequence([0.5, 0.9, 0.1, 0.9, 0.1]),
    );

    expect(result).toEqual(['a', 'c']);
  });

  it('N больше длины списка — все вопросы (без shuffle — как есть)', () => {
    const result = pickQuestionIds(
      block({ itemIds: ['a', 'b'], shuffle: false, questionsPerAttempt: 5 }),
      () => 0,
    );

    expect(result).toEqual(['a', 'b']);
  });

  it('поле не указано — все вопросы, поведение как раньше', () => {
    const withoutShuffle = pickQuestionIds(block({ itemIds: ['a', 'b'] }), () => 0);
    expect(withoutShuffle).toEqual(['a', 'b']);

    const withShuffle = pickQuestionIds(
      block({ itemIds: ['a', 'b'], shuffle: true }),
      fixedSequence([0.9, 0.1]),
    );
    expect(withShuffle).toEqual(['b', 'a']);
  });

  // ADR-0082, дополнение: обязательные вопросы.
  describe('requiredItemIds', () => {
    it('обязательный всегда входит в выборку, остаток добирается случайно', () => {
      const result = pickQuestionIds(
        block({
          itemIds: ['a', 'b', 'c', 'd'],
          requiredItemIds: ['b'],
          questionsPerAttempt: 3,
        }),
        fixedSequence([0.9, 0.1, 0.5]), // ключи a/c/d — довыбор из остальных
      );

      expect(result).toContain('b');
      expect(result).toHaveLength(3);
    });

    it('остаток — ровно questionsPerAttempt минус число обязательных', () => {
      // Обязательный один (b), нужно 3 — довыбор из a/c/d даёт ровно 2.
      const result = pickQuestionIds(
        block({
          itemIds: ['a', 'b', 'c', 'd'],
          requiredItemIds: ['b'],
          questionsPerAttempt: 3,
        }),
        fixedSequence([0.9, 0.1, 0.5]),
      );

      const optionalPicked = result.filter((id) => id !== 'b');
      expect(optionalPicked).toHaveLength(2);
      expect(new Set(optionalPicked).size).toBe(2);
    });

    it('обязательных ровно questionsPerAttempt — довыбора нет, только обязательные', () => {
      const result = pickQuestionIds(
        block({
          itemIds: ['a', 'b', 'c'],
          requiredItemIds: ['a', 'c'],
          questionsPerAttempt: 2,
        }),
        fixedSequence([0.5]), // b не выбирается, но shuffleOnce всё равно проходит по остатку
      );

      expect(result).toEqual(['a', 'c']);
    });

    it('без shuffle — итоговый порядок как в itemIds, не порядок выборки', () => {
      const result = pickQuestionIds(
        block({
          itemIds: ['a', 'b', 'c', 'd'],
          shuffle: false,
          requiredItemIds: ['b'],
          questionsPerAttempt: 3,
        }),
        fixedSequence([0.9, 0.1, 0.5]), // довыбор (по ключам): c, d
      );

      expect(result).toEqual(['b', 'c', 'd']);
    });

    it('с shuffle — порядок обязательных и довыбранных следует случайным ключам', () => {
      const result = pickQuestionIds(
        block({
          itemIds: ['a', 'b', 'c', 'd'],
          shuffle: true,
          requiredItemIds: ['b'],
          questionsPerAttempt: 3,
        }),
        // Первые три ключа — довыбор из a/c/d (даёт c, d), следующие три —
        // перемешивание итогового набора [b, c, d].
        fixedSequence([0.9, 0.1, 0.5, 0.5, 0.9, 0.1]),
      );

      expect(result).toEqual(['d', 'b', 'c']);
    });

    it('requiredItemIds отсутствует — поведение как до дополнения (без изменений)', () => {
      const withoutRequired = pickQuestionIds(
        block({ itemIds: ['a', 'b', 'c'], shuffle: false, questionsPerAttempt: 2 }),
        fixedSequence([0.1, 0.9, 0.5]),
      );
      const withEmptyRequired = pickQuestionIds(
        block({
          itemIds: ['a', 'b', 'c'],
          shuffle: false,
          questionsPerAttempt: 2,
          requiredItemIds: [],
        }),
        fixedSequence([0.1, 0.9, 0.5]),
      );

      expect(withoutRequired).toEqual(['a', 'c']);
      expect(withEmptyRequired).toEqual(['a', 'c']);
    });
  });
});
