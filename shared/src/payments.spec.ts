// Чистые функции оплат (ADR-0049) — без Mongo и без DI (CLAUDE.md «Тесты»).
import { describe, expect, it } from 'vitest';
import { formatAmountIls } from './payments';

describe('formatAmountIls', () => {
  it('круглая сумма — без агорот', () => {
    expect(formatAmountIls(25000)).toBe('250 ₪');
  });

  it('сумма с агорами — через запятую', () => {
    expect(formatAmountIls(25050)).toBe('250,50 ₪');
  });

  it('ноль', () => {
    expect(formatAmountIls(0)).toBe('0 ₪');
  });

  it('одна агора — с ведущим нулём дробной части', () => {
    expect(formatAmountIls(1)).toBe('0,01 ₪');
  });

  // Сумма приходит целой и неотрицательной (DTO: @IsInt() @Min(0)), но
  // форматтер живёт и в shared, где этой гарантии нет: дроби и минус дали бы
  // «2,50.5 ₪» на экране — лучше пусто, чем мусор вместо денег.
  it('дробное и отрицательное — пустая строка, не мусор', () => {
    expect(formatAmountIls(250.5)).toBe('');
    expect(formatAmountIls(-100)).toBe('');
  });
});
