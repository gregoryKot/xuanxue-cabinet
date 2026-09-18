import { describe, expect, it } from 'vitest';
import { formatPaidMaterialsCountHint } from './materialsPaidCountHint';

describe('formatPaidMaterialsCountHint', () => {
  it('null — список не загружен или отфильтрован, подсказки нет', () => {
    expect(formatPaidMaterialsCountHint(null)).toBeNull();
  });

  it('0 — честно про пустоту, не «0 материалов»', () => {
    expect(formatPaidMaterialsCountHint(0)).toBe(
      'Сейчас так не помечен ни один материал.',
    );
  });

  it('1 — единственное число', () => {
    expect(formatPaidMaterialsCountHint(1)).toBe('Сейчас так помечено 1 материал.');
  });

  it('3 — «материала»', () => {
    expect(formatPaidMaterialsCountHint(3)).toBe('Сейчас так помечено 3 материала.');
  });

  it('5 — «материалов»', () => {
    expect(formatPaidMaterialsCountHint(5)).toBe('Сейчас так помечено 5 материалов.');
  });
});
