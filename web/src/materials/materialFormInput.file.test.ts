// Ссылка необязательна, если у материала есть файл (ADR-0134) — отдельным
// файлом, не в materialFormInput.test.ts: тот уже 170 строк, а
// check-file-size-ratchet.mjs выше 150 строк файл только уменьшает.
import { describe, expect, it } from 'vitest';
import {
  initialMaterialFormState,
  toCreateInput,
  toUpdateInput,
  validateMaterialForm,
  type MaterialFormState,
} from './materialFormInput';

function makeState(overrides: Partial<MaterialFormState> = {}): MaterialFormState {
  return {
    title: 'Ван Пэйшэн — форма 24',
    url: '',
    kind: 'book',
    classIds: [],
    access: 'all',
    tagsText: '',
    ...overrides,
  };
}

describe('validateMaterialForm — контекст файла (ADR-0134)', () => {
  it('без второго аргумента — прежнее поведение: пустая ссылка не проходит', () => {
    expect(validateMaterialForm(makeState())).toEqual({
      field: 'url',
      message: 'Вставьте ссылку на материал.',
    });
  });

  it('ссылки нет, файла нет, но экран умеет прикладывать файл — составное сообщение', () => {
    const error = validateMaterialForm(makeState(), {
      hasFile: false,
      fileSupported: true,
    });
    expect(error).toEqual({
      field: 'url',
      message: 'Вставьте ссылку на материал или приложите файл.',
    });
  });

  it('ссылки нет, но файл на экране невозможен (короткая форма ADR-0056) — прежний текст', () => {
    const error = validateMaterialForm(makeState(), {
      hasFile: false,
      fileSupported: false,
    });
    expect(error).toEqual({
      field: 'url',
      message: 'Вставьте ссылку на материал.',
    });
  });

  it('файл есть — пустая ссылка форму не ломает', () => {
    const error = validateMaterialForm(makeState(), {
      hasFile: true,
      fileSupported: true,
    });
    expect(error).toBeNull();
  });

  it('файл есть, но вписанная ссылка битая — проверка формата всё равно работает', () => {
    const error = validateMaterialForm(makeState({ url: 'ftp://example.com' }), {
      hasFile: true,
      fileSupported: true,
    });
    expect(error).toEqual({
      field: 'url',
      message: 'Ссылка должна начинаться с http:// или https://.',
    });
  });
});

describe('initialMaterialFormState — материал без ссылки (ADR-0134)', () => {
  it('нет ключа url — состояние формы получает пустую строку', () => {
    const state = initialMaterialFormState({
      id: 'm1',
      title: 'Методичка',
      kind: 'document',
      classIds: [],
      lessonIds: [],
      access: 'all',
      tags: [],
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(state.url).toBe('');
  });
});

describe('toCreateInput / toUpdateInput — ссылка (ADR-0134)', () => {
  it('пустое поле ссылки — ключа url в теле создания нет вовсе', () => {
    const input = toCreateInput(makeState({ url: '  ' }));
    expect('url' in input).toBe(false);
  });

  it('непустая ссылка — уходит строкой в теле создания', () => {
    const input = toCreateInput(makeState({ url: ' https://example.com ' }));
    expect(input.url).toBe('https://example.com');
  });

  it('пустое поле ссылки в PATCH — url: null («убрать ссылку»), не пустая строка', () => {
    const input = toUpdateInput(makeState({ url: '' }));
    expect(input.url).toBeNull();
  });

  it('непустая ссылка в PATCH — уходит строкой, как в создании', () => {
    const input = toUpdateInput(makeState({ url: 'https://example.com/book' }));
    expect(input.url).toBe('https://example.com/book');
  });
});
