// Чистая часть кнопки предпросмотра: есть ли в форме правки, которых нет на
// сервере (useSaveAndPreview.ts). Сам переход и сохранение проверяет экранный
// тест редактора (ExamEditorScreen.test.tsx) — там есть и роутер, и сеть.
import { describe, expect, it } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import { initialExamFormState } from './examFormInput';
import { hasUnsavedChanges } from './useSaveAndPreview';

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Форма ученика',
    description: 'Итоговый экзамен',
    level: 'начальный',
    blocks: [{ id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: true }],
    shuffleOptions: true,
    timeLimitMin: 40,
    attemptsAllowed: 2,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('hasUnsavedChanges', () => {
  it('состояние из экзамена без правок — false', () => {
    const exam = makeExam();
    expect(hasUnsavedChanges(initialExamFormState(exam), exam)).toBe(false);
  });

  it('добавили вопрос в список — true', () => {
    const exam = makeExam();
    const state = initialExamFormState(exam);
    expect(
      hasUnsavedChanges({ ...state, questionIds: [...state.questionIds, 'i9'] }, exam),
    ).toBe(true);
  });

  it('новый экзамен: без правок — false, с вписанным названием — true', () => {
    const state = initialExamFormState(null);
    expect(hasUnsavedChanges(state, null)).toBe(false);
    expect(hasUnsavedChanges({ ...state, title: 'Экзамен' }, null)).toBe(true);
  });
});
