// Чистая логика привязки материала к дате занятия (ADR-0056) — без React и
// без сети (CLAUDE.md «Чистая логика»).
import { describe, expect, it } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import { attachLesson, detachLesson, filterLibraryCandidates } from './lessonMaterials';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('attachLesson', () => {
  it('дата добавляется к уже имеющимся привязкам, а не заменяет их', () => {
    expect(attachLesson(['l2'], 'l1')).toEqual(['l2', 'l1']);
  });

  it('уже привязанная дата второй раз не попадает', () => {
    expect(attachLesson(['l1', 'l2'], 'l1')).toEqual(['l1', 'l2']);
  });
});

describe('detachLesson', () => {
  it('снимает только эту дату, остальные привязки остаются', () => {
    expect(detachLesson(['l1', 'l2'], 'l1')).toEqual(['l2']);
  });

  it('дата и так не привязана — список не меняется', () => {
    expect(detachLesson(['l2'], 'l1')).toEqual(['l2']);
  });
});

describe('filterLibraryCandidates', () => {
  const library = [
    makeMaterial({ id: 'm1', title: 'Ван Пэйшэн — форма 24' }),
    makeMaterial({ id: 'm2', title: 'Разминка суставов', tags: ['для старшей'] }),
  ];

  it('пустой запрос — вся библиотека без уже привязанных', () => {
    expect(filterLibraryCandidates(library, '', ['m1']).map((m) => m.id)).toEqual(['m2']);
  });

  it('ищет по названию без учёта регистра', () => {
    expect(filterLibraryCandidates(library, 'разминка', []).map((m) => m.id)).toEqual([
      'm2',
    ]);
  });

  it('ищет по тегу', () => {
    expect(filterLibraryCandidates(library, 'старшей', []).map((m) => m.id)).toEqual([
      'm2',
    ]);
  });

  it('ничего не совпало — пустой список', () => {
    expect(filterLibraryCandidates(library, 'цигун', [])).toEqual([]);
  });
});
