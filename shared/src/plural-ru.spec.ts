import { describe, expect, it } from 'vitest';
import { formatDaysRu, formatYearsRu, pluralRu } from './plural-ru';

const DAY_FORMS = { one: 'день', few: 'дня', many: 'дней', other: 'дней' } as const;

describe('pluralRu', () => {
  it.each([
    [1, 'день'],
    [2, 'дня'],
    [3, 'дня'],
    [5, 'дней'],
    [11, 'дней'],
    [21, 'день'],
    [22, 'дня'],
    [30, 'дней'],
    [111, 'дней'],
    [0, 'дней'],
  ])('%i → %s', (n, expected) => {
    expect(pluralRu(n, DAY_FORMS)).toBe(expected);
  });
});

describe('formatDaysRu', () => {
  it.each([
    [1, '1 день'],
    [2, '2 дня'],
    [5, '5 дней'],
    [21, '21 день'],
    [30, '30 дней'],
    [41, '41 день'],
    [90, '90 дней'],
    [111, '111 дней'],
    [365, '365 дней'],
  ])('%i → «%s»', (days, expected) => {
    expect(formatDaysRu(days)).toBe(expected);
  });

  it.each([0, -3, 1.5, Number.NaN])('%s → пустая строка, не «0 дней»', (days) => {
    expect(formatDaysRu(days)).toBe('');
  });
});

describe('formatYearsRu', () => {
  it.each([
    [1, '1 год'],
    [2, '2 года'],
    [3, '3 года'],
    [5, '5 лет'],
    [11, '11 лет'],
    [21, '21 год'],
  ])('%i → «%s»', (years, expected) => {
    expect(formatYearsRu(years)).toBe(expected);
  });

  it.each([0, -1, 2.5, Number.NaN])('%s → пустая строка', (years) => {
    expect(formatYearsRu(years)).toBe('');
  });
});
