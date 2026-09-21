import { describe, expect, it } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { sortGradedAttempts } from './sortGradedAttempts';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'graded',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    submittedAt: '2026-09-01T01:00:00Z',
    expired: false,
    outcome: 'passed',
    gradedAt: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

describe('sortGradedAttempts', () => {
  it('пустой список — пустой результат', () => {
    expect(sortGradedAttempts([])).toEqual([]);
  });

  it('свежепроверенное — сверху, старое — снизу', () => {
    const sorted = sortGradedAttempts([
      makeAttempt({ id: 'old', gradedAt: '2026-09-01T10:00:00Z' }),
      makeAttempt({ id: 'new', gradedAt: '2026-09-03T10:00:00Z' }),
      makeAttempt({ id: 'middle', gradedAt: '2026-09-02T10:00:00Z' }),
    ]);

    expect(sorted.map((a) => a.id)).toEqual(['new', 'middle', 'old']);
  });

  it('исходный массив не изменяется (чистая функция)', () => {
    const source = [
      makeAttempt({ id: 'old', gradedAt: '2026-09-01T10:00:00Z' }),
      makeAttempt({ id: 'new', gradedAt: '2026-09-03T10:00:00Z' }),
    ];

    sortGradedAttempts(source);

    expect(source.map((a) => a.id)).toEqual(['old', 'new']);
  });

  it('без gradedAt (рассинхрон данных) — уходит в конец, не роняет сортировку', () => {
    const sorted = sortGradedAttempts([
      makeAttempt({ id: 'no-date', gradedAt: undefined }),
      makeAttempt({ id: 'dated', gradedAt: '2026-09-02T10:00:00Z' }),
    ]);

    expect(sorted.map((a) => a.id)).toEqual(['dated', 'no-date']);
  });

  it('без gradedAt у обоих (двойной рассинхрон) — не роняет сортировку', () => {
    const sorted = sortGradedAttempts([
      makeAttempt({ id: 'a', gradedAt: undefined }),
      makeAttempt({ id: 'b', gradedAt: undefined }),
    ]);

    expect(sorted.map((a) => a.id)).toEqual(['a', 'b']);
  });
});
