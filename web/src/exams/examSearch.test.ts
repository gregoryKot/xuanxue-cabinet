import { describe, expect, it } from 'vitest';
import { matchesExamSearch } from './examSearch';

describe('matchesExamSearch', () => {
  it('пустой запрос — совпадает всё', () => {
    expect(matchesExamSearch('Первый уровень', '')).toBe(true);
    expect(matchesExamSearch('Первый уровень', '   ')).toBe(true);
  });

  it('подстрока в любом регистре — совпадение', () => {
    expect(matchesExamSearch('Форма и дыхание', 'форма')).toBe(true);
    expect(matchesExamSearch('Форма и дыхание', 'ФОРМА')).toBe(true);
  });

  it('пробелы по краям запроса не мешают совпадению', () => {
    expect(matchesExamSearch('Форма и дыхание', '  дыхание  ')).toBe(true);
  });

  it('нет подстроки — не совпадает', () => {
    expect(matchesExamSearch('Форма и дыхание', 'толкающие')).toBe(false);
  });
});
