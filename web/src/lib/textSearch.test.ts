import { describe, expect, it } from 'vitest';
import { matchesSearch } from './textSearch';

describe('matchesSearch', () => {
  it('пустой запрос — подходит всё', () => {
    expect(matchesSearch(['Первый уровень'], '')).toBe(true);
    expect(matchesSearch([], '   ')).toBe(true);
  });

  it('подстрока без учёта регистра', () => {
    expect(matchesSearch(['Форма и дыхание'], 'форма')).toBe(true);
    expect(matchesSearch(['Форма и дыхание'], 'ДЫХАНИЕ')).toBe(true);
  });

  it('пробелы по краям запроса не мешают', () => {
    expect(matchesSearch(['Форма и дыхание'], '  дыхание ')).toBe(true);
  });

  it('совпадение хотя бы в одном поле', () => {
    expect(matchesSearch(['Зачем придумали тайцзи?', 'история'], 'истор')).toBe(true);
  });

  it('ни одно поле не подошло — нет', () => {
    expect(matchesSearch(['Зачем придумали тайцзи?', 'история'], 'веник')).toBe(false);
  });
});
