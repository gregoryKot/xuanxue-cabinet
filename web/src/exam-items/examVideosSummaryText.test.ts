import { describe, expect, it } from 'vitest';
import type { ExamVideoStatsDto } from '@xuanxue/shared';
import { formatExamVideosSummary } from './examVideosSummaryText';

const NO_EXTRAS = {
  withoutPosterCount: 0,
  codecPendingCount: 0,
} satisfies Partial<ExamVideoStatsDto>;

describe('formatExamVideosSummary — пусто', () => {
  it('stats — null (сбой загрузки или ещё не пришло) — null, не текст-мусор', () => {
    expect(formatExamVideosSummary(null)).toBeNull();
  });

  it('чистая база (count 0) — null, а не «0 видео»', () => {
    expect(formatExamVideosSummary({ ...NO_EXTRAS, count: 0, totalBytes: 0 })).toBeNull();
  });
});

describe('formatExamVideosSummary — объём', () => {
  it('меньше 1 МБ — килобайты целым числом', () => {
    expect(
      formatExamVideosSummary({
        count: 1,
        totalBytes: 200 * 1024,
        withoutPosterCount: 0,
        codecPendingCount: 0,
      }),
    ).toBe('Видео к вопросам: 1 — 200 КБ');
  });

  it('1 МБ и больше — мегабайты с одним знаком, запятая как разделитель', () => {
    expect(
      formatExamVideosSummary({
        count: 3,
        totalBytes: 90_000_000,
        withoutPosterCount: 0,
        codecPendingCount: 0,
      }),
    ).toBe('Видео к вопросам: 3 — 85,8 МБ');
  });
});

describe('formatExamVideosSummary — без кадра (ADR-0182)', () => {
  it('есть видео без кадра — число дописано к строке сводки', () => {
    expect(
      formatExamVideosSummary({
        count: 54,
        totalBytes: 90_000_000,
        withoutPosterCount: 54,
        codecPendingCount: 0,
      }),
    ).toBe('Видео к вопросам: 54 — 85,8 МБ, без кадра: 54');
  });

  it('кадр есть у всех — строка прежняя, без «без кадра: 0»', () => {
    expect(
      formatExamVideosSummary({
        count: 2,
        totalBytes: 200 * 1024,
        withoutPosterCount: 0,
        codecPendingCount: 0,
      }),
    ).not.toContain('без кадра');
  });
});

describe('formatExamVideosSummary — ждут перегона (ADR-0189)', () => {
  it('есть видео не в H.264 — число дописано к строке сводки', () => {
    expect(
      formatExamVideosSummary({
        count: 54,
        totalBytes: 90_000_000,
        withoutPosterCount: 0,
        codecPendingCount: 12,
      }),
    ).toBe('Видео к вопросам: 54 — 85,8 МБ, ждут перегона: 12');
  });

  it('и без кадра, и ждут перегона — оба числа, кадры первыми', () => {
    expect(
      formatExamVideosSummary({
        count: 54,
        totalBytes: 90_000_000,
        withoutPosterCount: 3,
        codecPendingCount: 12,
      }),
    ).toBe('Видео к вопросам: 54 — 85,8 МБ, без кадра: 3, ждут перегона: 12');
  });

  it('все видео открываются везде — строка прежняя, без «ждут перегона: 0»', () => {
    expect(
      formatExamVideosSummary({ ...NO_EXTRAS, count: 2, totalBytes: 200 * 1024 }),
    ).not.toContain('перегона');
  });

  it('чистая база — по-прежнему null, даже если сервер прислал число', () => {
    expect(
      formatExamVideosSummary({
        count: 0,
        totalBytes: 0,
        withoutPosterCount: 0,
        codecPendingCount: 5,
      }),
    ).toBeNull();
  });
});
