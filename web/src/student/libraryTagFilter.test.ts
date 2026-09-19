import { describe, expect, it } from 'vitest';
import type { MyMaterialDto } from '@xuanxue/shared';
import { filterMaterialsByTag } from './libraryTagFilter';

function makeMaterial(overrides: Partial<MyMaterialDto> = {}): MyMaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
    kind: 'book',
    classTitles: [],
    tags: [],
    url: 'https://example.com/book',
    ...overrides,
  };
}

describe('filterMaterialsByTag', () => {
  it('пустой тег — весь список без изменений', () => {
    const materials = [makeMaterial({ tags: ['старшая'] }), makeMaterial({ id: 'm2' })];
    expect(filterMaterialsByTag(materials, '')).toEqual(materials);
  });

  it('тег есть у части материалов — остаются только они', () => {
    const withTag = makeMaterial({ id: 'm1', tags: ['старшая'] });
    const withoutTag = makeMaterial({ id: 'm2', tags: ['база'] });
    expect(filterMaterialsByTag([withTag, withoutTag], 'старшая')).toEqual([withTag]);
  });

  it('тега нет ни у одного материала — пустой список', () => {
    const materials = [makeMaterial({ tags: ['база'] })];
    expect(filterMaterialsByTag(materials, 'старшая')).toEqual([]);
  });

  it('пустой список материалов — пустой результат для любого тега', () => {
    expect(filterMaterialsByTag([], 'старшая')).toEqual([]);
  });
});
