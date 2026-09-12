import { describe, expect, it } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import {
  addBlock,
  addItemToBlock,
  initialBlockDrafts,
  moveItemDown,
  moveItemUp,
  removeBlock,
  removeItemFromBlock,
  renameBlock,
  setBlockRequired,
  setBlockShuffle,
  swap,
  toBlockInputs,
  usedItemIds,
  type ExamBlockDraft,
} from './examBlocksInput';

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Экзамен',
    description: '',
    level: '',
    blocks: [],
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('initialBlockDrafts', () => {
  it('null — пустой массив', () => {
    expect(initialBlockDrafts(null)).toEqual([]);
  });

  it('форма с блоками — переносит поля, не мутирует itemIds оригинала', () => {
    const exam = makeExam({
      blocks: [
        {
          id: 'b1',
          title: 'Теория',
          itemIds: ['i1', 'i2'],
          shuffle: true,
          required: true,
        },
      ],
    });
    const drafts = initialBlockDrafts(exam);

    expect(drafts).toEqual([
      { id: 'b1', title: 'Теория', itemIds: ['i1', 'i2'], shuffle: true, required: true },
    ]);
    drafts[0]?.itemIds.push('i3');
    expect(exam.blocks[0]?.itemIds).toEqual(['i1', 'i2']);
  });
});

describe('toBlockInputs', () => {
  it('обрезает пробелы в названии блока', () => {
    const drafts: ExamBlockDraft[] = [
      { title: '  Форма  ', itemIds: ['i1'], shuffle: false, required: false },
    ];
    expect(toBlockInputs(drafts)).toEqual([
      { id: undefined, title: 'Форма', itemIds: ['i1'], shuffle: false, required: false },
    ]);
  });
});

describe('addBlock / removeBlock', () => {
  it('addBlock добавляет пустой блок в конец', () => {
    const result = addBlock([]);
    expect(result).toEqual([{ title: '', itemIds: [], shuffle: false, required: false }]);
  });

  it('removeBlock убирает блок по индексу, остальные не трогает', () => {
    const blocks = addBlock(addBlock([]));
    const result = removeBlock(blocks, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(blocks[1]);
  });
});

describe('renameBlock / setBlockShuffle / setBlockRequired', () => {
  const blocks: ExamBlockDraft[] = [
    { title: '', itemIds: [], shuffle: false, required: false },
  ];

  it('renameBlock меняет только title нужного блока', () => {
    expect(renameBlock(blocks, 0, 'Теория')[0]?.title).toBe('Теория');
  });

  it('setBlockShuffle переключает флаг', () => {
    expect(setBlockShuffle(blocks, 0, true)[0]?.shuffle).toBe(true);
  });

  it('setBlockRequired переключает флаг', () => {
    expect(setBlockRequired(blocks, 0, true)[0]?.required).toBe(true);
  });

  it('индекс вне диапазона — блоки не меняются', () => {
    expect(renameBlock(blocks, 5, 'X')).toEqual(blocks);
  });
});

describe('usedItemIds', () => {
  it('собирает id по всем блокам сразу', () => {
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: ['i1', 'i2'], shuffle: false, required: false },
      { title: '', itemIds: ['i2', 'i3'], shuffle: false, required: false },
    ];
    expect(usedItemIds(blocks)).toEqual(new Set(['i1', 'i2', 'i3']));
  });
});

describe('addItemToBlock', () => {
  it('добавляет вопрос в конец блока', () => {
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: ['i1'], shuffle: false, required: false },
    ];
    expect(addItemToBlock(blocks, 0, 'i2')[0]?.itemIds).toEqual(['i1', 'i2']);
  });

  it('уже добавленный в любом блоке вопрос — второй раз не добавляется', () => {
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: ['i1'], shuffle: false, required: false },
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    const result = addItemToBlock(blocks, 1, 'i1');
    expect(result).toEqual(blocks);
  });
});

describe('removeItemFromBlock', () => {
  it('убирает вопрос из нужного блока по id', () => {
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: ['i1', 'i2'], shuffle: false, required: false },
    ];
    expect(removeItemFromBlock(blocks, 0, 'i1')[0]?.itemIds).toEqual(['i2']);
  });
});

describe('moveItemUp / moveItemDown', () => {
  const blocks: ExamBlockDraft[] = [
    { title: '', itemIds: ['i1', 'i2', 'i3'], shuffle: false, required: false },
  ];

  it('moveItemUp меняет местами с предыдущим', () => {
    expect(moveItemUp(blocks, 0, 1)[0]?.itemIds).toEqual(['i2', 'i1', 'i3']);
  });

  it('moveItemUp на первом элементе — без изменений', () => {
    expect(moveItemUp(blocks, 0, 0)).toBe(blocks);
  });

  it('moveItemDown меняет местами со следующим', () => {
    expect(moveItemDown(blocks, 0, 0)[0]?.itemIds).toEqual(['i2', 'i1', 'i3']);
  });

  it('moveItemDown на последнем элементе — без изменений', () => {
    expect(moveItemDown(blocks, 0, 2)[0]?.itemIds).toEqual(['i1', 'i2', 'i3']);
  });
});

describe('swap', () => {
  it('меняет местами элементы с валидными индексами', () => {
    expect(swap([1, 2, 3], 0, 2)).toEqual([3, 2, 1]);
  });

  it('индекс вне диапазона — возвращает копию без изменений (защита)', () => {
    expect(swap([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});
