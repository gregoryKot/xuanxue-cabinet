import { describe, expect, it } from 'vitest';
import { formatAnswerVideosSummary } from './answerVideosSummaryText';

describe('formatAnswerVideosSummary', () => {
  it('null — пустая база (count 0), честное отсутствие', () => {
    expect(formatAnswerVideosSummary({ count: 0, totalBytes: 0 })).toBeNull();
  });

  it('null — сбой загрузки (stats null)', () => {
    expect(formatAnswerVideosSummary(null)).toBeNull();
  });

  it('число и объём — не «0/NaN/мусор»', () => {
    expect(formatAnswerVideosSummary({ count: 3, totalBytes: 5 * 1024 * 1024 })).toBe(
      'Видео-ответов от учеников: 3 — 5,0 МБ',
    );
  });
});
