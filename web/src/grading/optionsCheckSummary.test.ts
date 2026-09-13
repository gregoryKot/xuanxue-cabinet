import { describe, expect, it } from 'vitest';
import { formatOptionsCheckSummary } from './optionsCheckSummary';

describe('formatOptionsCheckSummary', () => {
  it('без лишних вариантов — короткая строка', () => {
    expect(
      formatOptionsCheckSummary({
        correctSelectedCount: 2,
        correctTotalCount: 2,
        incorrectSelectedCount: 0,
      }),
    ).toBe('Выбрано верно 2 из 2.');
  });

  it('один лишний вариант — единственное число', () => {
    expect(
      formatOptionsCheckSummary({
        correctSelectedCount: 1,
        correctTotalCount: 2,
        incorrectSelectedCount: 1,
      }),
    ).toBe('Выбрано верно 1 из 2, ещё 1 лишний.');
  });

  it('несколько лишних вариантов — склонение по pluralRu', () => {
    expect(
      formatOptionsCheckSummary({
        correctSelectedCount: 0,
        correctTotalCount: 1,
        incorrectSelectedCount: 3,
      }),
    ).toBe('Выбрано верно 0 из 1, ещё 3 лишних.');
  });
});
