// Ключ месяца оплаты (ADR-0049) — чистые функции, без Mongo и без DI.
import { describe, expect, it } from 'vitest';
import {
  formatMonthNameRu,
  formatMonthRu,
  isMonthKey,
  MONTH_KEY_RE,
  shiftMonth,
} from './month-key';

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

describe('formatMonthNameRu', () => {
  it('сентябрь без года — для «Оплаты за сентябрь нет»', () => {
    expect(formatMonthNameRu('2026-09')).toBe('сентябрь');
  });

  it('декабрь — последний индекс таблицы', () => {
    expect(formatMonthNameRu('2026-12')).toBe('декабрь');
  });

  it('непроверенный месяц вне таблицы — строка как есть, а не «undefined»', () => {
    expect(formatMonthNameRu('2026-13')).toBe('2026-13');
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
