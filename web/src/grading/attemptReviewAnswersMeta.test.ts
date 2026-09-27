import { describe, expect, it } from 'vitest';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import {
  formatAttemptAnswersSummary,
  orderManualFirst,
} from './attemptReviewAnswersMeta';

function block(overrides: Partial<AttemptReviewBlockDto> = {}): AttemptReviewBlockDto {
  return { id: 'b1', title: '', questions: [], ...overrides };
}

const TEXT_QUESTION = {
  itemId: 'q1',
  kind: 'text' as const,
  prompt: 'Опишите дыхание',
  options: [],
  answered: true,
};
const CORRECT_QUESTION = {
  itemId: 'q2',
  kind: 'single' as const,
  prompt: 'Сколько стоек в форме?',
  options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
  optionsCheck: {
    correctSelectedCount: 1,
    correctTotalCount: 1,
    incorrectSelectedCount: 0,
  },
  answered: true,
};
const WRONG_QUESTION = {
  ...CORRECT_QUESTION,
  itemId: 'q3',
  optionsCheck: {
    correctSelectedCount: 1,
    correctTotalCount: 1,
    incorrectSelectedCount: 1,
  },
};
const UNANSWERED_OPTIONS_QUESTION = {
  itemId: 'q4',
  kind: 'single' as const,
  prompt: 'Сколько стоек в форме?',
  options: [{ id: 'o1', text: 'Три', correct: true, selected: false }],
  answered: false,
};
const VIDEO_QUESTION = {
  itemId: 'q5',
  kind: 'video' as const,
  prompt: 'Снимите стойку',
  options: [],
  answered: false,
};

describe('formatAttemptAnswersSummary — пустая попытка', () => {
  it('нет блоков — честный текст, не «0 вопросов»', () => {
    expect(formatAttemptAnswersSummary([])).toBe('В этой попытке пока нет вопросов.');
  });

  it('блоки есть, вопросов в них нет — тот же честный текст', () => {
    expect(formatAttemptAnswersSummary([block()])).toBe(
      'В этой попытке пока нет вопросов.',
    );
  });
});

// Отзыв владельца 2026-09-27: вместо «15 проверила машина, 1 — вы» — сколько
// верных среди вопросов с вариантами и сколько проверить учителю.
describe('formatAttemptAnswersSummary — верные и ручные', () => {
  it('смешанная попытка — верные из вопросов с вариантами и сколько проверить', () => {
    const blocks = [
      block({ questions: [TEXT_QUESTION, CORRECT_QUESTION, WRONG_QUESTION] }),
      block({ id: 'b2', questions: [VIDEO_QUESTION, CORRECT_QUESTION] }),
    ];
    expect(formatAttemptAnswersSummary(blocks)).toBe('Верно 2 из 3 · проверить 2');
  });

  it('вопрос с вариантами без ответа — не верный, но в знаменателе', () => {
    const blocks = [
      block({ questions: [CORRECT_QUESTION, UNANSWERED_OPTIONS_QUESTION] }),
    ];
    expect(formatAttemptAnswersSummary(blocks)).toBe('Верно 1 из 2');
  });

  it('только ручные вопросы — одно число «проверить»', () => {
    const blocks = [block({ questions: [TEXT_QUESTION, VIDEO_QUESTION] })];
    expect(formatAttemptAnswersSummary(blocks)).toBe('Проверить 2');
  });
});

describe('orderManualFirst', () => {
  it('внутри блока ручные вопросы первыми, порядок групп как в снимке', () => {
    const blocks = [
      block({
        questions: [CORRECT_QUESTION, TEXT_QUESTION, WRONG_QUESTION, VIDEO_QUESTION],
      }),
    ];
    const ids = orderManualFirst(blocks)[0]?.questions.map((q) => q.itemId);
    expect(ids).toEqual(['q1', 'q5', 'q2', 'q3']);
  });

  it('блок с ручными вопросами встаёт раньше блока без них', () => {
    const blocks = [
      block({ id: 'auto', questions: [CORRECT_QUESTION] }),
      block({ id: 'manual', questions: [TEXT_QUESTION] }),
    ];
    expect(orderManualFirst(blocks).map((b) => b.id)).toEqual(['manual', 'auto']);
  });
});
