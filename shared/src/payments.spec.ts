// Чистые функции оплат (ADR-0049) — без Mongo и без DI (CLAUDE.md «Тесты»).
import { describe, expect, it } from 'vitest';
import {
  formatAmountIls,
  formatMonthRu,
  isMonthKey,
  MONTH_KEY_RE,
  shiftMonth,
} from './payments';

describe('isMonthKey', () => {
  it('несуществующий месяц 13 — нет', () => {
    expect(isMonthKey('2026-13')).toBe(false);
  });

  it('месяц без ведущего нуля — нет, формат ГГГГ-ММ строгий', () => {
    expect(isMonthKey('2026-9')).toBe(false);
  });

  it('короткий год — нет', () => {
    expect(isMonthKey('26-09')).toBe(false);
  });

  it('пустая строка — нет', () => {
    expect(isMonthKey('')).toBe(false);
  });

  it('валидный месяц — да, на границах 01 и 12', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(MONTH_KEY_RE.test('2026-01')).toBe(true);
    expect(MONTH_KEY_RE.test('2026-12')).toBe(true);
  });
});

describe('formatMonthRu', () => {
  it('январь', () => {
    expect(formatMonthRu('2026-01')).toBe('январь 2026');
  });

  it('сентябрь', () => {
    expect(formatMonthRu('2026-09')).toBe('сентябрь 2026');
  });

  it('декабрь', () => {
    expect(formatMonthRu('2026-12')).toBe('декабрь 2026');
  });
});

describe('shiftMonth', () => {
  it('назад через границу года', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('вперёд через границу года', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('в пределах года', () => {
    expect(shiftMonth('2026-05', 2)).toBe('2026-07');
  });

  it('на несколько лет вперёд', () => {
    expect(shiftMonth('2026-06', 13)).toBe('2027-07');
  });
});

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
