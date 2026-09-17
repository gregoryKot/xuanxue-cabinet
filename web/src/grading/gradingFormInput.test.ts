import { describe, expect, it } from 'vitest';
import type { ExamGradingDto } from '@xuanxue/shared';
import {
  initialGradingFormState,
  toGradingInput,
  validateGradingForm,
  type GradingFormState,
} from './gradingFormInput';

function makeGrading(overrides: Partial<ExamGradingDto> = {}): ExamGradingDto {
  return {
    id: 'g1',
    attemptId: 'a1',
    examId: 'e1',
    userId: 'u1',
    graderId: 't1',
    comment: 'В целом сдал',
    outcome: 'passed',
    gradedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function baseState(overrides: Partial<GradingFormState> = {}): GradingFormState {
  return {
    comment: '',
    outcome: 'passed',
    ...overrides,
  };
}

describe('initialGradingFormState', () => {
  it('оценки ещё нет — комментарий пустой, итог не выбран', () => {
    const state = initialGradingFormState(undefined);
    expect(state.comment).toBe('');
    expect(state.outcome).toBe('');
  });

  it('оценка уже стоит — форма заполнена ею', () => {
    const state = initialGradingFormState(makeGrading());
    expect(state.comment).toBe('В целом сдал');
    expect(state.outcome).toBe('passed');
  });
});

describe('validateGradingForm', () => {
  it('итог не выбран — ошибка', () => {
    expect(validateGradingForm(baseState({ outcome: '' }))).toBe(
      'Выберите итог проверки.',
    );
  });

  it('итог выбран — null', () => {
    expect(validateGradingForm(baseState())).toBeNull();
  });
});

describe('toGradingInput', () => {
  it('пустой комментарий — undefined, не пустая строка', () => {
    const input = toGradingInput(baseState());
    expect(input.comment).toBeUndefined();
    expect(input.outcome).toBe('passed');
  });

  it('заполненный комментарий — обрезан по краям', () => {
    const input = toGradingInput(baseState({ comment: '  Хорошо сдал  ' }));
    expect(input.comment).toBe('Хорошо сдал');
  });

  it('outcome передаётся как есть', () => {
    const input = toGradingInput(baseState({ outcome: 'needs_work' }));
    expect(input.outcome).toBe('needs_work');
  });
});
