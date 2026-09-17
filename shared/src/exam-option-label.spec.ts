// Подпись варианта без текста (ADR-0035) — общая строка для кабинета и бота,
// юнит-тест без DOM и без Mongo (CLAUDE.md «Тесты», «Чистая логика»).
import { describe, expect, it } from 'vitest';
import { formatOptionLabel } from './exam-option-label';

describe('formatOptionLabel', () => {
  it('есть текст — возвращает его как есть, индекс не участвует', () => {
    expect(formatOptionLabel('Вправо', 0)).toBe('Вправо');
  });

  it('пустой текст — «Вариант N», индекс считается с 1', () => {
    expect(formatOptionLabel('', 0)).toBe('Вариант 1');
    expect(formatOptionLabel('', 2)).toBe('Вариант 3');
  });
});
