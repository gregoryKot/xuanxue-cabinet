// Чистая логика, без Mongo и без DI (CLAUDE.md «Тесты»).
import type { ExamGradingDto, PutGradingInput } from '@xuanxue/shared';
import { didGradingChange } from './grading-changed';

const BASE_DTO: ExamGradingDto = {
  id: 'g1',
  attemptId: 'a1',
  examId: 'e1',
  userId: 'u1',
  graderId: 'gr1',
  criteria: [],
  comment: 'Поправьте стойку',
  outcome: 'needs_work',
  gradedAt: '2026-09-13T09:00:00.000Z',
};

const BASE_INPUT: PutGradingInput = {
  criteria: [{ id: 'c1', score: 1 }],
  comment: 'Поправьте стойку',
  outcome: 'needs_work',
};

describe('didGradingChange', () => {
  it('первая оценка попытки (нет предыдущей) — всегда true', () => {
    expect(didGradingChange(undefined, BASE_INPUT)).toBe(true);
  });

  it('тот же outcome и тот же comment — false (тот самый повторный PUT)', () => {
    expect(didGradingChange(BASE_DTO, { ...BASE_INPUT })).toBe(false);
  });

  it('изменился outcome — true', () => {
    expect(didGradingChange(BASE_DTO, { ...BASE_INPUT, outcome: 'passed' })).toBe(true);
  });

  it('изменился comment — true', () => {
    expect(didGradingChange(BASE_DTO, { ...BASE_INPUT, comment: 'Другой текст' })).toBe(
      true,
    );
  });

  it('поменялись только баллы критерия — false (текст ученику не меняется)', () => {
    expect(
      didGradingChange(BASE_DTO, { ...BASE_INPUT, criteria: [{ id: 'c1', score: 5 }] }),
    ).toBe(false);
  });

  it('undefined и пустая строка в comment — один и тот же «без комментария»', () => {
    const noComment: ExamGradingDto = { ...BASE_DTO, comment: undefined };
    expect(didGradingChange(noComment, { ...BASE_INPUT, comment: '' })).toBe(false);
  });
});
