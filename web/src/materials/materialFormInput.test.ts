// Чистая логика страницы материала — состояние, валидация, сборка тела
// запроса (CLAUDE.md «Тесты»), по образцу channels/channelFormInput.test.ts.
import { describe, expect, it } from 'vitest';
import { MATERIAL_LIMITS, type MaterialDto } from '@xuanxue/shared';
import {
  initialMaterialFormState,
  toCreateInput,
  toUpdateInput,
  validateMaterialForm,
  type MaterialFormState,
} from './materialFormInput';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: ['c1'],
    access: 'all',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeState(overrides: Partial<MaterialFormState> = {}): MaterialFormState {
  return {
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    paid: false,
    ...overrides,
  };
}

describe('initialMaterialFormState', () => {
  it('создание — вид по умолчанию первый из списка, пустые поля, не платно', () => {
    const state = initialMaterialFormState(null);
    expect(state.title).toBe('');
    expect(state.url).toBe('');
    expect(state.kind).toBe('book');
    expect(state.classIds).toEqual([]);
    expect(state.paid).toBe(false);
  });

  it('правка — поля предзаполнены из материала, access: paid включает галочку', () => {
    const state = initialMaterialFormState(
      makeMaterial({ kind: 'video', classIds: ['c1', 'c2'], access: 'paid' }),
    );
    expect(state.kind).toBe('video');
    expect(state.classIds).toEqual(['c1', 'c2']);
    expect(state.paid).toBe(true);
  });
});

describe('validateMaterialForm', () => {
  it('пустое название — ошибка поля title', () => {
    const error = validateMaterialForm(makeState({ title: '  ' }));
    expect(error).toEqual({ field: 'title', message: 'Впишите название материала.' });
  });

  it('название длиннее лимита — ошибка поля title', () => {
    const error = validateMaterialForm(
      makeState({ title: 'a'.repeat(MATERIAL_LIMITS.title + 1) }),
    );
    expect(error?.field).toBe('title');
  });

  it('пустая ссылка — ошибка поля url', () => {
    const error = validateMaterialForm(makeState({ url: '  ' }));
    expect(error).toEqual({ field: 'url', message: 'Вставьте ссылку на материал.' });
  });

  it('ссылка без http(s) — ошибка поля url', () => {
    const error = validateMaterialForm(makeState({ url: 'ftp://example.com/book' }));
    expect(error?.field).toBe('url');
  });

  it('ссылка длиннее лимита — ошибка поля url', () => {
    const longUrl = `https://example.com/${'a'.repeat(MATERIAL_LIMITS.url)}`;
    const error = validateMaterialForm(makeState({ url: longUrl }));
    expect(error?.field).toBe('url');
  });

  it('валидная форма — null', () => {
    expect(validateMaterialForm(makeState())).toBeNull();
  });
});

describe('toCreateInput / toUpdateInput', () => {
  it('обрезает пробелы у названия и ссылки, access: all у выключенной галочки', () => {
    const input = toCreateInput(
      makeState({ title: '  Название  ', url: '  https://example.com  ' }),
    );
    expect(input).toEqual({
      title: 'Название',
      url: 'https://example.com',
      kind: 'book',
      classIds: [],
      access: 'all',
    });
  });

  it('paid — access: paid', () => {
    const input = toCreateInput(makeState({ paid: true }));
    expect(input.access).toBe('paid');
  });

  it('пустой список занятий уходит пустым массивом, а не отсутствует', () => {
    const input = toCreateInput(makeState({ classIds: [] }));
    expect(input.classIds).toEqual([]);
    expect('classIds' in input).toBe(true);
  });

  it('несколько занятий — массив id как есть', () => {
    const input = toCreateInput(makeState({ classIds: ['c1', 'c2'] }));
    expect(input.classIds).toEqual(['c1', 'c2']);
  });

  it('toUpdateInput собирает то же тело, что и toCreateInput', () => {
    const state = makeState({ classIds: ['c1'], paid: true });
    expect(toUpdateInput(state)).toEqual(toCreateInput(state));
  });
});
