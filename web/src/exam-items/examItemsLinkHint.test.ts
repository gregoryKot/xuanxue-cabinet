import { describe, expect, it } from 'vitest';
import { EXAM_ITEMS_LINK_BASE_HINT, formatExamItemsLinkHint } from './examItemsLinkHint';

describe('formatExamItemsLinkHint', () => {
  it('null (число ещё не пришло) — только объяснение раздела', () => {
    expect(formatExamItemsLinkHint(null)).toBe(EXAM_ITEMS_LINK_BASE_HINT);
  });

  it('пустая база — 0, только объяснение раздела, не «0 вопросов»', () => {
    expect(formatExamItemsLinkHint(0)).toBe(EXAM_ITEMS_LINK_BASE_HINT);
  });

  it('один спотыкающийся вопрос — единственное число и согласованный глагол', () => {
    expect(formatExamItemsLinkHint(1)).toBe(
      `${EXAM_ITEMS_LINK_BASE_HINT} 1 вопрос путает больше половины ответивших.`,
    );
  });

  it('несколько — «вопроса», глагол во множественном числе', () => {
    expect(formatExamItemsLinkHint(3)).toBe(
      `${EXAM_ITEMS_LINK_BASE_HINT} 3 вопроса путают больше половины ответивших.`,
    );
  });

  it('пять и больше — «вопросов»', () => {
    expect(formatExamItemsLinkHint(5)).toBe(
      `${EXAM_ITEMS_LINK_BASE_HINT} 5 вопросов путают больше половины ответивших.`,
    );
  });
});
