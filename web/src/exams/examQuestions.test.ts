import { describe, expect, it } from 'vitest';
import type { ExamBlockDto, ExamDto, ExamItemDto } from '@xuanxue/shared';
import {
  addQuestion,
  filterQuestionCandidates,
  initialQuestionIds,
  initialShuffleQuestions,
  mergeCreatedItems,
  moveQuestionDown,
  moveQuestionUp,
  removeQuestion,
  toBlockInputs,
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
    tags: [],
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

describe('toBlockInputs', () => {
  it('сохранение — один блок без заголовка с id первого блока старой формы', () => {
    const blocks = toBlockInputs(
      ['a', 'b', 'c'],
      true,
      exam([block('b1', ['a', 'b']), block('b2', ['c'])]),
    );

    expect(blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['a', 'b', 'c'], shuffle: true },
    ]);
  });

  it('новый экзамен — блок без id, сервер заведёт его сам', () => {
    expect(toBlockInputs(['a'], false, null)).toEqual([
      { id: undefined, title: '', itemIds: ['a'], shuffle: false },
    ]);
  });

  it('экзамен без блоков — тоже блок без id', () => {
    expect(toBlockInputs(['a'], false, exam([]))).toEqual([
      { id: undefined, title: '', itemIds: ['a'], shuffle: false },
    ]);
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
    item({ id: 'i1', prompt: 'Зачем придумали тайцзи?', tags: ['история'] }),
    item({ id: 'i2', prompt: 'Что такое «пустая» нога?', tags: ['стойки'] }),
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

  it('поиск по тегу без регистра', () => {
    expect(filterQuestionCandidates(items, ' Стойки ', []).map((i) => i.id)).toEqual([
      'i2',
    ]);
  });

  it('уже добавленные вопросы не показываются', () => {
    expect(filterQuestionCandidates(items, '', ['i1']).map((i) => i.id)).toEqual(['i2']);
  });

  it('ни текст, ни теги не совпали — пусто', () => {
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
