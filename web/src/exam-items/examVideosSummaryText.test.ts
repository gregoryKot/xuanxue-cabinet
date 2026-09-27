import { describe, expect, it } from 'vitest';
import { formatExamVideosSummary } from './examVideosSummaryText';

describe('formatExamVideosSummary — пусто', () => {
  it('stats — null (сбой загрузки или ещё не пришло) — null, не текст-мусор', () => {
    expect(formatExamVideosSummary(null)).toBeNull();
  });

  it('чистая база (count 0) — null, а не «0 видео»', () => {
    expect(formatExamVideosSummary({ count: 0, totalBytes: 0 })).toBeNull();
  });
});

describe('formatExamVideosSummary — объём', () => {
  it('меньше 1 МБ — килобайты целым числом', () => {
    expect(formatExamVideosSummary({ count: 1, totalBytes: 200 * 1024 })).toBe(
      'Видео к вопросам: 1 — 200 КБ',
    );
  });

  it('1 МБ и больше — мегабайты с одним знаком, запятая как разделитель', () => {
    expect(formatExamVideosSummary({ count: 3, totalBytes: 90_000_000 })).toBe(
      'Видео к вопросам: 3 — 85,8 МБ',
    );
  });
});
