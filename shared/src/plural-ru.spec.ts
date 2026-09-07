import { describe, expect, it } from 'vitest';
import { pluralRu } from './plural-ru';

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
