import { describe, expect, it } from 'vitest';
import { formatGradingQueueCountLabel, formatGradingQueueHint } from './gradingQueueHint';

describe('formatGradingQueueHint', () => {
  it('null (число ещё не пришло) — общий текст без числа', () => {
    expect(formatGradingQueueHint(null)).toBe(
      'Сданные работы, которые ждут вашей оценки.',
    );
  });

  it('пустая база — честный текст, не «0 работ»', () => {
    expect(formatGradingQueueHint(0)).toBe('Пока нечего проверять.');
  });

  it('одна работа — единственное число и согласованный глагол', () => {
    expect(formatGradingQueueHint(1)).toBe('1 работа ждёт проверки.');
  });

  it('несколько работ — «работы», глагол во множественном числе', () => {
    expect(formatGradingQueueHint(2)).toBe('2 работы ждут проверки.');
  });

  it('пять и больше — «работ»', () => {
    expect(formatGradingQueueHint(5)).toBe('5 работ ждут проверки.');
  });

  it('11–14 — «работ» (исключение из общего правила окончаний)', () => {
    expect(formatGradingQueueHint(11)).toBe('11 работ ждут проверки.');
  });

  it('21 — снова единственное число («работа»)', () => {
    expect(formatGradingQueueHint(21)).toBe('21 работа ждёт проверки.');
  });
});

describe('formatGradingQueueCountLabel', () => {
  it('одна работа — единственное число', () => {
    expect(formatGradingQueueCountLabel(1)).toBe('работа учеников');
  });

  it('несколько работ — множественное число', () => {
    expect(formatGradingQueueCountLabel(3)).toBe('работы учеников');
  });

  it('пять и больше — «работ»', () => {
    expect(formatGradingQueueCountLabel(5)).toBe('работ учеников');
  });
});
