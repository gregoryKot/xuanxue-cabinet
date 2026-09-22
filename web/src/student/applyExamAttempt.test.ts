// Тест на найденный баг (ADR-0119, отзыв тестировщика 2026-09-22: «кнопка
// продолжить, а ответы обнуляются») — сама правка списка, без React и без
// сети. Сборка списка/карточки — TasksScreen.test.tsx, MyExamsProvider.test.tsx.
import { describe, expect, it } from 'vitest';
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import { applyExamAttempt } from './applyExamAttempt';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма 1',
    description: '',
    level: '1',
    attemptsAllowed: 3,
    attemptsUsed: 0,
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма 1',
    userId: 'u1',
    status: 'in_progress',
    blocks: [],
    answers: [],
    startedAt: '2026-09-22T10:00:00Z',
    expired: false,
    ...overrides,
  };
}

describe('applyExamAttempt — список без него', () => {
  it('список ещё не пришёл (null) — остаётся null', () => {
    expect(applyExamAttempt(null, makeAttempt())).toBeNull();
  });

  it('попытка не по этому экзамену — список не тронут', () => {
    const exams = [makeExam()];
    const result = applyExamAttempt(exams, makeAttempt({ examId: 'другой' }));
    expect(result).toEqual(exams);
  });
});

describe('applyExamAttempt — новая попытка (старт)', () => {
  it('заводит lastAttempt и увеличивает attemptsUsed на 1', () => {
    const exams = [makeExam({ attemptsUsed: 0 })];

    const result = applyExamAttempt(
      exams,
      makeAttempt({ id: 'a1', status: 'in_progress' }),
    );

    expect(result?.[0]).toMatchObject({
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
  });

  it('заново после прошлой оценённой попытки — новый id, старый outcome не переезжает', () => {
    const exams = [
      makeExam({
        attemptsUsed: 1,
        lastAttempt: {
          id: 'старая',
          status: 'graded',
          expired: false,
          outcome: 'needs_work',
          comment: 'Ниже стойки',
        },
      }),
    ];

    const result = applyExamAttempt(
      exams,
      makeAttempt({ id: 'новая', status: 'in_progress' }),
    );

    expect(result?.[0]?.attemptsUsed).toBe(2);
    expect(result?.[0]?.lastAttempt).toEqual({
      id: 'новая',
      status: 'in_progress',
      expired: false,
    });
  });
});

// Регрессия ровно на найденный баг: «Продолжить» на устаревшей карточке
// заводил вторую, пустую попытку и списывал её из лимита молча. Патч ответа
// отправки — та же попытка, тот же id, attemptsUsed не растёт.
describe('applyExamAttempt — отправка той же попытки', () => {
  it('id не менялся — attemptsUsed не растёт, статус обновляется', () => {
    const exams = [
      makeExam({
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
      }),
    ];

    const result = applyExamAttempt(
      exams,
      makeAttempt({ id: 'a1', status: 'submitted' }),
    );

    expect(result?.[0]).toMatchObject({
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
  });
});
