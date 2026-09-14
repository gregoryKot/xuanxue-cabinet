import { describe, expect, it } from 'vitest';
import type { ExamItemStatsDto } from '@xuanxue/shared';
import {
  formatAskedSummary,
  formatOptionLine,
  NEVER_ASKED_MESSAGE,
} from './examItemStatsText';

type ExamItemOptionStatsDto = NonNullable<ExamItemStatsDto['options']>[number];

function makeStats(overrides: Partial<ExamItemStatsDto> = {}): ExamItemStatsDto {
  return { itemId: 'i1', kind: 'text', askedCount: 0, ...overrides };
}

describe('formatAskedSummary', () => {
  it('пустая база — честный текст, не «0/NaN»', () => {
    expect(formatAskedSummary(makeStats({ askedCount: 0 }))).toBe(NEVER_ASKED_MESSAGE);
  });

  it('вопрос без вариантов — только сколько раз задавали, без «верно»', () => {
    expect(formatAskedSummary(makeStats({ askedCount: 1 }))).toBe('Задавали 1 раз.');
  });

  it('вопрос с вариантами — сколько раз задавали и сколько верно', () => {
    const stats = makeStats({ kind: 'single', askedCount: 12, correctCount: 9 });
    expect(formatAskedSummary(stats)).toBe('Задавали 12 раз, верно ответили 9.');
  });

  it('единственное число — «1 раз»', () => {
    expect(formatAskedSummary(makeStats({ askedCount: 1 }))).toContain('1 раз.');
  });

  it('2–4 — «раза»', () => {
    expect(formatAskedSummary(makeStats({ askedCount: 3 }))).toContain('3 раза.');
  });

  it('5 и больше — «раз»', () => {
    expect(formatAskedSummary(makeStats({ askedCount: 5 }))).toContain('5 раз.');
  });
});

describe('formatOptionLine', () => {
  function makeOption(
    overrides: Partial<ExamItemOptionStatsDto> = {},
  ): ExamItemOptionStatsDto {
    return { id: 'o1', text: 'пять', correct: false, chosenCount: 0, ...overrides };
  }

  it('верный вариант — пометка «Верный вариант»', () => {
    expect(formatOptionLine(makeOption({ correct: true, chosenCount: 2 }))).toBe(
      '«пять» — выбрали 2 раза. Верный вариант.',
    );
  });

  it('неверный вариант — без пометки', () => {
    expect(formatOptionLine(makeOption({ correct: false, chosenCount: 1 }))).toBe(
      '«пять» — выбрали 1 раз.',
    );
  });

  it('ни разу не выбрали — «0 раз», не пусто', () => {
    expect(formatOptionLine(makeOption({ chosenCount: 0 }))).toBe(
      '«пять» — выбрали 0 раз.',
    );
  });
});
