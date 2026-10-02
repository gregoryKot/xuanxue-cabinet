import { describe, expect, it } from 'vitest';
import { formatQuestionVersion } from './attemptReviewQuestionVersion';

describe('formatQuestionVersion (F62)', () => {
  it('редакция выше первой — строка с номером', () => {
    expect(formatQuestionVersion(3)).toBe('Редакция вопроса 3 — та, что видел ученик');
  });

  it('первая редакция — строки нет, вопрос ещё не правили', () => {
    expect(formatQuestionVersion(1)).toBeNull();
  });

  it('версии в ответе нет (старые фикстуры) — строки нет', () => {
    expect(formatQuestionVersion(undefined)).toBeNull();
  });
});
