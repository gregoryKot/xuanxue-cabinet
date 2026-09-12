import { describe, expect, it } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { filterPickerCandidates } from './examItemPickerFilter';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Вопрос',
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

describe('filterPickerCandidates', () => {
  it('оставляет только опубликованные', () => {
    const items = [
      makeItem({ id: 'a', status: 'published' }),
      makeItem({ id: 'b', status: 'draft' }),
    ];
    expect(filterPickerCandidates(items, '').map((i) => i.id)).toEqual(['a']);
  });

  it('пустой тег — все опубликованные', () => {
    const items = [makeItem({ tags: ['ян'] }), makeItem({ id: 'i2', tags: [] })];
    expect(filterPickerCandidates(items, '')).toHaveLength(2);
  });

  it('тег — частичное совпадение без учёта регистра', () => {
    const items = [
      makeItem({ id: 'a', tags: ['База Ян'] }),
      makeItem({ id: 'b', tags: ['теория'] }),
    ];
    expect(filterPickerCandidates(items, 'ян').map((i) => i.id)).toEqual(['a']);
  });

  it('тег не встречается ни у одного — пустой список', () => {
    const items = [makeItem({ tags: ['теория'] })];
    expect(filterPickerCandidates(items, 'ян')).toEqual([]);
  });
});
