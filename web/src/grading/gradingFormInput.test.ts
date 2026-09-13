import { describe, expect, it } from 'vitest';
import type { ExamGradingDto, RubricCriterionDto } from '@xuanxue/shared';
import {
  initialGradingFormState,
  toGradingInput,
  validateGradingForm,
  type GradingFormState,
} from './gradingFormInput';

const RUBRIC: RubricCriterionDto[] = [
  { id: 'c1', title: 'Устойчивость', description: 'Вес переносится плавно', maxScore: 5 },
  { id: 'c2', title: 'Темп', maxScore: 3 },
];

function makeGrading(overrides: Partial<ExamGradingDto> = {}): ExamGradingDto {
  return {
    id: 'g1',
    attemptId: 'a1',
    examId: 'e1',
    userId: 'u1',
    graderId: 't1',
    criteria: [
      { id: 'c1', title: 'Устойчивость', maxScore: 5, score: 4, comment: 'Хорошо' },
    ],
    comment: 'В целом сдал',
    outcome: 'passed',
    gradedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function baseState(overrides: Partial<GradingFormState> = {}): GradingFormState {
  return {
    criteria: [
      { id: 'c1', title: 'Устойчивость', maxScore: 5, scoreText: '4', comment: '' },
      { id: 'c2', title: 'Темп', maxScore: 3, scoreText: '2', comment: '' },
    ],
    comment: '',
    outcome: 'passed',
    ...overrides,
  };
}

describe('initialGradingFormState', () => {
  it('оценки ещё нет — баллы и комментарии пустые, итог не выбран', () => {
    const state = initialGradingFormState(RUBRIC, undefined);
    expect(state.criteria).toEqual([
      {
        id: 'c1',
        title: 'Устойчивость',
        description: 'Вес переносится плавно',
        maxScore: 5,
        scoreText: '',
        comment: '',
      },
      {
        id: 'c2',
        title: 'Темп',
        description: undefined,
        maxScore: 3,
        scoreText: '',
        comment: '',
      },
    ]);
    expect(state.comment).toBe('');
    expect(state.outcome).toBe('');
  });

  it('оценка уже стоит — форма заполнена ею по совпадению id критерия', () => {
    const state = initialGradingFormState(RUBRIC, makeGrading());
    expect(state.criteria[0]).toMatchObject({
      id: 'c1',
      scoreText: '4',
      comment: 'Хорошо',
    });
    // c2 не было в снимке оценки (рубрику дополнили после проверки) — пусто, не 0.
    expect(state.criteria[1]).toMatchObject({ id: 'c2', scoreText: '', comment: '' });
    expect(state.comment).toBe('В целом сдал');
    expect(state.outcome).toBe('passed');
  });

  it('пустая рубрика — пустой список критериев', () => {
    expect(initialGradingFormState([], undefined).criteria).toEqual([]);
  });
});

describe('validateGradingForm', () => {
  it('пустая рубрика — сообщение «нет критериев проверки»', () => {
    expect(validateGradingForm(baseState({ criteria: [] }))).toMatch(/нет критериев/);
  });

  it('пустое поле баллов — сообщение с диапазоном и названием критерия', () => {
    const state = baseState({
      criteria: [
        { id: 'c1', title: 'Устойчивость', maxScore: 5, scoreText: '', comment: '' },
      ],
    });
    expect(validateGradingForm(state)).toBe(
      'Баллы по критерию «Устойчивость» — от 0 до 5.',
    );
  });

  it('нецелые баллы — ошибка', () => {
    const state = baseState({
      criteria: [
        { id: 'c1', title: 'Устойчивость', maxScore: 5, scoreText: '2.5', comment: '' },
      ],
    });
    expect(validateGradingForm(state)).toMatch(/Устойчивость/);
  });

  it('баллы меньше 0 — ошибка', () => {
    const state = baseState({
      criteria: [
        { id: 'c1', title: 'Устойчивость', maxScore: 5, scoreText: '-1', comment: '' },
      ],
    });
    expect(validateGradingForm(state)).toMatch(/Устойчивость/);
  });

  it('баллы больше maxScore — ошибка', () => {
    const state = baseState({
      criteria: [
        { id: 'c1', title: 'Устойчивость', maxScore: 5, scoreText: '6', comment: '' },
      ],
    });
    expect(validateGradingForm(state)).toMatch(/Устойчивость/);
  });

  it('баллы на границах диапазона (0 и maxScore) — валидно', () => {
    const state = baseState({
      criteria: [
        { id: 'c1', title: 'Устойчивость', maxScore: 5, scoreText: '0', comment: '' },
      ],
    });
    expect(validateGradingForm(state)).toBeNull();
  });

  it('итог не выбран — ошибка', () => {
    expect(validateGradingForm(baseState({ outcome: '' }))).toBe(
      'Выберите итог проверки.',
    );
  });

  it('всё заполнено — null', () => {
    expect(validateGradingForm(baseState())).toBeNull();
  });
});

describe('toGradingInput', () => {
  it('баллы — числом, пустой комментарий — undefined', () => {
    const input = toGradingInput(baseState());
    expect(input.criteria).toEqual([
      { id: 'c1', score: 4, comment: undefined },
      { id: 'c2', score: 2, comment: undefined },
    ]);
    expect(input.comment).toBeUndefined();
    expect(input.outcome).toBe('passed');
  });

  it('заполненные комментарии — обрезаны по краям', () => {
    const state = baseState({
      criteria: [
        {
          id: 'c1',
          title: 'Устойчивость',
          maxScore: 5,
          scoreText: '4',
          comment: '  Хорошо  ',
        },
      ],
      comment: '  В целом сдал  ',
    });
    const input = toGradingInput(state);
    expect(input.criteria[0]?.comment).toBe('Хорошо');
    expect(input.comment).toBe('В целом сдал');
  });
});
