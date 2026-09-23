import { describe, expect, it } from 'vitest';
import type { ExamBlockDto, ExamDto, ExamItemDto } from '@xuanxue/shared';
import {
  addQuestion,
  filterQuestionCandidates,
  initialQuestionIds,
  initialQuestionsPerAttempt,
  initialRequiredIds,
  initialShuffleQuestions,
  mergeCreatedItems,
  moveQuestionDown,
  moveQuestionUp,
  pruneRequiredIds,
  removeQuestion,
  toBlockInputs,
  toggleRequired,
} from './examQuestions';

function block(
  id: string,
  itemIds: string[],
  overrides: Partial<ExamBlockDto> = {},
): ExamBlockDto {
  return { id, title: '', itemIds, shuffle: false, ...overrides };
}

function exam(blocks: ExamBlockDto[]): ExamDto {
  return {
    id: 'x1',
    title: 'Экзамен',
    description: '',
    level: '',
    blocks,
    shuffleOptions: false,
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function item(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'single',
    prompt: 'Зачем придумали тайцзи?',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('initialQuestionIds', () => {
  it('нового экзамена ещё нет — пустой список', () => {
    expect(initialQuestionIds(null)).toEqual([]);
  });

  it('три блока старой формы сливаются в один список в порядке блоков', () => {
    const merged = initialQuestionIds(
      exam([block('b1', ['a', 'b']), block('b2', ['c']), block('b3', ['d', 'e'])]),
    );

    expect(merged).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('initialShuffleQuestions', () => {
  it('нового экзамена ещё нет — не перемешивать', () => {
    expect(initialShuffleQuestions(null)).toBe(false);
  });

  it('перемешивание берётся у первого блока', () => {
    expect(initialShuffleQuestions(exam([block('b1', ['a'], { shuffle: true })]))).toBe(
      true,
    );
  });

  it('форма без блоков — не перемешивать', () => {
    expect(initialShuffleQuestions(exam([]))).toBe(false);
  });
});

describe('initialQuestionsPerAttempt', () => {
  it('нового экзамена ещё нет — undefined', () => {
    expect(initialQuestionsPerAttempt(null)).toBeUndefined();
  });

  it('поле берётся у первого блока', () => {
    expect(
      initialQuestionsPerAttempt(
        exam([block('b1', ['a', 'b', 'c'], { questionsPerAttempt: 2 })]),
      ),
    ).toBe(2);
  });

  it('у блока поля нет — undefined (сдающему достаются все вопросы)', () => {
    expect(initialQuestionsPerAttempt(exam([block('b1', ['a'])]))).toBeUndefined();
  });

  it('форма без блоков — undefined', () => {
    expect(initialQuestionsPerAttempt(exam([]))).toBeUndefined();
  });
});

describe('toBlockInputs', () => {
  it('сохранение — один блок без заголовка с id первого блока старой формы', () => {
    const blocks = toBlockInputs({
      itemIds: ['a', 'b', 'c'],
      shuffle: true,
      questionsPerAttempt: undefined,
      requiredItemIds: [],
      exam: exam([block('b1', ['a', 'b']), block('b2', ['c'])]),
    });

    expect(blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['a', 'b', 'c'], shuffle: true },
    ]);
  });

  it('новый экзамен — блок без id, сервер заведёт его сам', () => {
    expect(
      toBlockInputs({
        itemIds: ['a'],
        shuffle: false,
        questionsPerAttempt: undefined,
        requiredItemIds: [],
        exam: null,
      }),
    ).toEqual([{ id: undefined, title: '', itemIds: ['a'], shuffle: false }]);
  });

  it('экзамен без блоков — тоже блок без id', () => {
    expect(
      toBlockInputs({
        itemIds: ['a'],
        shuffle: false,
        questionsPerAttempt: undefined,
        requiredItemIds: [],
        exam: exam([]),
      }),
    ).toEqual([{ id: undefined, title: '', itemIds: ['a'], shuffle: false }]);
  });

  it('questionsPerAttempt задан — попадает в блок', () => {
    const blocks = toBlockInputs({
      itemIds: ['a', 'b'],
      shuffle: false,
      questionsPerAttempt: 1,
      requiredItemIds: [],
      exam: null,
    });

    expect(blocks).toEqual([
      {
        id: undefined,
        title: '',
        itemIds: ['a', 'b'],
        shuffle: false,
        questionsPerAttempt: 1,
      },
    ]);
  });

  it('questionsPerAttempt не задан — ключа в блоке нет вовсе', () => {
    const blocks = toBlockInputs({
      itemIds: ['a'],
      shuffle: false,
      questionsPerAttempt: undefined,
      requiredItemIds: [],
      exam: null,
    });

    expect(blocks[0]).not.toHaveProperty('questionsPerAttempt');
  });

  it('requiredItemIds непустой — попадает в блок', () => {
    const blocks = toBlockInputs({
      itemIds: ['a', 'b'],
      shuffle: false,
      questionsPerAttempt: 1,
      requiredItemIds: ['a'],
      exam: null,
    });

    expect(blocks[0]).toMatchObject({ requiredItemIds: ['a'] });
  });

  it('requiredItemIds пуст — ключа в блоке нет вовсе', () => {
    const blocks = toBlockInputs({
      itemIds: ['a'],
      shuffle: false,
      questionsPerAttempt: undefined,
      requiredItemIds: [],
      exam: null,
    });

    expect(blocks[0]).not.toHaveProperty('requiredItemIds');
  });

  it('вопрос убрали из списка — отметка не отправляется (пруним перед сохранением)', () => {
    const blocks = toBlockInputs({
      itemIds: ['a'],
      shuffle: false,
      questionsPerAttempt: undefined,
      requiredItemIds: ['a', 'gone'],
      exam: null,
    });

    expect(blocks[0]).toMatchObject({ requiredItemIds: ['a'] });
  });
});

describe('initialRequiredIds', () => {
  it('нового экзамена ещё нет — пустой список', () => {
    expect(initialRequiredIds(null)).toEqual([]);
  });

  it('обязательные вопросы собираются со всех блоков', () => {
    const required = initialRequiredIds(
      exam([
        block('b1', ['a', 'b'], { requiredItemIds: ['a'] }),
        block('b2', ['c'], { requiredItemIds: ['c'] }),
      ]),
    );

    expect(required).toEqual(['a', 'c']);
  });

  it('у блока нет отметок — пустой список', () => {
    expect(initialRequiredIds(exam([block('b1', ['a'])]))).toEqual([]);
  });
});

describe('toggleRequired', () => {
  it('вопроса не было в списке — добавляется', () => {
    expect(toggleRequired([], 'a')).toEqual(['a']);
  });

  it('вопрос уже был в списке — убирается', () => {
    expect(toggleRequired(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('pruneRequiredIds', () => {
  it('id есть в списке вопросов — остаётся', () => {
    expect(pruneRequiredIds(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b']);
  });

  it('id убранного вопроса пропадает', () => {
    expect(pruneRequiredIds(['a', 'b'], ['a'])).toEqual(['a']);
  });

  it('пустая отметка — пустой список', () => {
    expect(pruneRequiredIds([], ['a'])).toEqual([]);
  });
});

describe('порядок вопросов', () => {
  it('«Выше» меняет вопрос местами с предыдущим', () => {
    expect(moveQuestionUp(['a', 'b', 'c'], 2)).toEqual(['a', 'c', 'b']);
  });

  it('первый вопрос «Выше» не двигается', () => {
    const ids = ['a', 'b'];
    expect(moveQuestionUp(ids, 0)).toBe(ids);
  });

  it('«Ниже» меняет вопрос местами со следующим', () => {
    expect(moveQuestionDown(['a', 'b', 'c'], 0)).toEqual(['b', 'a', 'c']);
  });

  it('последний вопрос «Ниже» не двигается', () => {
    const ids = ['a', 'b'];
    expect(moveQuestionDown(ids, 1)).toBe(ids);
  });
});

describe('добавление и удаление', () => {
  it('добавленный вопрос встаёт в конец списка', () => {
    expect(addQuestion(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('вопрос не добавляется дважды', () => {
    const ids = ['a', 'b'];
    expect(addQuestion(ids, 'a')).toBe(ids);
  });

  it('убранный вопрос исчезает, порядок остальных сохраняется', () => {
    expect(removeQuestion(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('filterQuestionCandidates', () => {
  const items = [
    item({ id: 'i1', prompt: 'Зачем придумали тайцзи?' }),
    item({ id: 'i2', prompt: 'Что такое «пустая» нога?' }),
    item({ id: 'i3', prompt: 'Черновик', status: 'draft' }),
    item({ id: 'i4', prompt: 'В архиве', status: 'archived' }),
  ];

  it('пустой запрос — все опубликованные вопросы', () => {
    expect(filterQuestionCandidates(items, '', []).map((i) => i.id)).toEqual([
      'i1',
      'i2',
    ]);
  });

  it('поиск по тексту вопроса без регистра', () => {
    expect(filterQuestionCandidates(items, 'ТАЙЦЗИ', []).map((i) => i.id)).toEqual([
      'i1',
    ]);
  });

  it('уже добавленные вопросы не показываются', () => {
    expect(filterQuestionCandidates(items, '', ['i1']).map((i) => i.id)).toEqual(['i2']);
  });

  it('текст не совпал — пусто', () => {
    expect(filterQuestionCandidates(items, 'дыхание', [])).toEqual([]);
  });
});

describe('mergeCreatedItems', () => {
  it('вопрос, заведённый в редакторе, добавляется в конец списка', () => {
    const known = [item({ id: 'i1' })];
    const created = [item({ id: 'i2', prompt: 'Новый вопрос' })];

    expect(mergeCreatedItems(known, created).map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('вопрос, который список уже содержит, не повторяется', () => {
    const known = [item({ id: 'i1', prompt: 'Старая формулировка' })];
    const created = [item({ id: 'i1', prompt: 'Другая формулировка' })];

    const merged = mergeCreatedItems(known, created);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.prompt).toBe('Старая формулировка');
  });
});
