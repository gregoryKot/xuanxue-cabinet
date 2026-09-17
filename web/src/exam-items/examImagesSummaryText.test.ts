import { describe, expect, it } from 'vitest';
import { formatExamImagesSummary } from './examImagesSummaryText';

describe('formatExamImagesSummary — пусто', () => {
  it('stats — null (сбой загрузки или ещё не пришло) — null, не текст-мусор', () => {
    expect(formatExamImagesSummary(null)).toBeNull();
  });

  it('чистая база (count 0) — null, а не «0 картинок»', () => {
    expect(formatExamImagesSummary({ count: 0, totalBytes: 0 })).toBeNull();
  });
});

describe('formatExamImagesSummary — объём в килобайтах', () => {
  it('меньше 1 МБ — килобайты целым числом', () => {
    expect(formatExamImagesSummary({ count: 5, totalBytes: 200 * 1024 })).toBe(
      'Картинок к вопросам: 5 — 200 КБ',
    );
  });

  it('дробный остаток килобайта округляется', () => {
    expect(formatExamImagesSummary({ count: 1, totalBytes: 1500 })).toBe(
      'Картинок к вопросам: 1 — 1 КБ',
    );
  });
});

describe('formatExamImagesSummary — объём в мегабайтах', () => {
  it('1 МБ и больше — мегабайты с одним знаком, запятая как разделитель', () => {
    expect(formatExamImagesSummary({ count: 12, totalBytes: 3_600_000 })).toBe(
      'Картинок к вопросам: 12 — 3,4 МБ',
    );
  });

  it('ровно 1 МБ — уже мегабайты, не килобайты', () => {
    expect(formatExamImagesSummary({ count: 2, totalBytes: 1024 * 1024 })).toBe(
      'Картинок к вопросам: 2 — 1,0 МБ',
    );
  });
});
