import type { RubricCriterionDto } from '@xuanxue/shared';
import { buildGradingCriteria } from './exam-grading-criteria';

const RUBRIC: RubricCriterionDto[] = [
  {
    id: 'c1',
    title: 'Устойчивость и центр',
    description: 'смотрим на баланс',
    maxScore: 5,
  },
  { id: 'c2', title: 'Плавность и дыхание', maxScore: 10 },
];

describe('buildGradingCriteria', () => {
  it('баллы в пределах maxScore — снимок с title/maxScore из рубрики', () => {
    const result = buildGradingCriteria(RUBRIC, [
      { id: 'c1', score: 4, comment: 'колено внутрь' },
      { id: 'c2', score: 10 },
    ]);

    expect(result).toEqual([
      {
        id: 'c1',
        title: 'Устойчивость и центр',
        maxScore: 5,
        score: 4,
        comment: 'колено внутрь',
      },
      {
        id: 'c2',
        title: 'Плавность и дыхание',
        maxScore: 10,
        score: 10,
        comment: undefined,
      },
    ]);
  });

  it('неизвестный критерий (рубрику успели переписать) — 400', () => {
    expect(() => buildGradingCriteria(RUBRIC, [{ id: 'unknown', score: 1 }])).toThrow(
      'не найден',
    );
  });

  it('баллы выше maxScore своего критерия — 400 с названием критерия', () => {
    expect(() => buildGradingCriteria(RUBRIC, [{ id: 'c1', score: 6 }])).toThrow(
      'Устойчивость и центр',
    );
  });

  it('отрицательные баллы — 400', () => {
    expect(() => buildGradingCriteria(RUBRIC, [{ id: 'c1', score: -1 }])).toThrow(
      'от 0 до 5',
    );
  });

  it('баллы 0 — допустимы (нижняя граница включительно)', () => {
    const result = buildGradingCriteria(RUBRIC, [{ id: 'c1', score: 0 }]);

    expect(result[0]?.score).toBe(0);
  });

  it('пустой список критериев на входе — пустой снимок, не ошибка', () => {
    expect(buildGradingCriteria(RUBRIC, [])).toEqual([]);
  });
});
