// Чистая часть «Сохранить экзамен вместе с раскрытым вопросом»
// (usePendingQuestion.ts): тронута ли форма вопроса и какое состояние
// экзамена уходит на сервер. Сам сценарий со страницей и сетью —
// ExamEditorPendingQuestion.test.tsx.
import { describe, expect, it } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { initialExamItemFormState } from '../exam-items/examItemFormInput';
import { initialExamFormState } from './examFormInput';
import { isQuestionFormTouched, withPendingQuestion } from './usePendingQuestion';

const item: ExamItemDto = {
  id: 'i1',
  kind: 'text',
  prompt: 'Как дышать?',
  options: [],
  status: 'published',
  version: 1,
  history: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('isQuestionFormTouched', () => {
  it('новая форма без ввода — false', () => {
    expect(isQuestionFormTouched(initialExamItemFormState(null), null)).toBe(false);
  });

  it('в новую форму загрузили только видео — true, его нельзя потерять молча', () => {
    const state = { ...initialExamItemFormState(null), videoId: 'v1' };
    expect(isQuestionFormTouched(state, null)).toBe(true);
  });

  it('правка без изменений — false, с новой формулировкой — true', () => {
    const state = initialExamItemFormState(item);
    expect(isQuestionFormTouched(state, item)).toBe(false);
    expect(isQuestionFormTouched({ ...state, prompt: 'Как стоять?' }, item)).toBe(true);
  });
});

describe('withPendingQuestion', () => {
  const state = { ...initialExamFormState(null), questionIds: ['a'] };

  it('вопрос сохранён — встаёт в конец списка экзамена', () => {
    const next = withPendingQuestion(state, {
      status: 'saved',
      item: { ...item, id: 'b' },
    });
    expect(next?.questionIds).toEqual(['a', 'b']);
  });

  it('вопрос уже в экзамене (правка) — список без дубля', () => {
    const next = withPendingQuestion(state, {
      status: 'saved',
      item: { ...item, id: 'a' },
    });
    expect(next?.questionIds).toEqual(['a']);
  });

  it('сохранять нечего — undefined, экзамен уходит как есть', () => {
    expect(withPendingQuestion(state, { status: 'none' })).toBeUndefined();
  });
});
