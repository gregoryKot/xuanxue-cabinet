import { describe, expect, it } from 'vitest';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { formatAttemptAnswersSummary } from './attemptReviewAnswersMeta';

function block(overrides: Partial<AttemptReviewBlockDto> = {}): AttemptReviewBlockDto {
  return { id: 'b1', title: '', questions: [], ...overrides };
}

const TEXT_QUESTION = {
  itemId: 'q1',
  kind: 'text' as const,
  prompt: 'Опишите дыхание',
  options: [],
};
const OPTIONS_QUESTION = {
  itemId: 'q2',
  kind: 'single' as const,
  prompt: 'Сколько стоек в форме?',
  options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
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

describe('formatAttemptAnswersSummary — смешанные вопросы', () => {
  it('и автопроверка, и ручная — оба числа в строке', () => {
    const blocks = [
      block({ questions: [TEXT_QUESTION, OPTIONS_QUESTION, OPTIONS_QUESTION] }),
    ];
    expect(formatAttemptAnswersSummary(blocks)).toBe(
      '3 вопроса · 2 проверила машина, 1 — вы',
    );
  });

  it('вопросы из разных блоков считаются вместе', () => {
    const blocks = [
      block({ id: 'b1', questions: [TEXT_QUESTION] }),
      block({ id: 'b2', questions: [OPTIONS_QUESTION] }),
    ];
    expect(formatAttemptAnswersSummary(blocks)).toBe(
      '2 вопроса · 1 проверила машина, 1 — вы',
    );
  });

  it('все вопросы только с автопроверкой', () => {
    const blocks = [block({ questions: [OPTIONS_QUESTION, OPTIONS_QUESTION] })];
    expect(formatAttemptAnswersSummary(blocks)).toBe('2 вопроса · все проверила машина');
  });

  it('все вопросы только ручные', () => {
    const blocks = [block({ questions: [TEXT_QUESTION, TEXT_QUESTION, TEXT_QUESTION] })];
    expect(formatAttemptAnswersSummary(blocks)).toBe('3 вопроса · все проверяете вы');
  });
});
