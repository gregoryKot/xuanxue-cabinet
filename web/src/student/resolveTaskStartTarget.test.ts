import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { resolveTaskStartTarget } from './resolveTaskStartTarget';

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

describe('resolveTaskStartTarget', () => {
  it('попытка в работе («Продолжить») — открыть её по id, без старта', () => {
    const exam = makeExam({
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });

    expect(resolveTaskStartTarget(exam)).toEqual({ kind: 'open', attemptId: 'a1' });
  });

  it('попыток ещё не было («Начать») — старт новой', () => {
    expect(resolveTaskStartTarget(makeExam())).toEqual({ kind: 'start' });
  });

  it('прошлую оценили, можно ещё раз («Пройти ещё раз») — старт новой, не старый id', () => {
    const exam = makeExam({
      attemptsUsed: 1,
      lastAttempt: {
        id: 'старая',
        status: 'graded',
        expired: false,
        outcome: 'needs_work',
      },
    });

    expect(resolveTaskStartTarget(exam)).toEqual({ kind: 'start' });
  });

  it('время закрыло попытку раньше отправки («Пройти ещё раз») — старт новой', () => {
    const exam = makeExam({
      attemptsUsed: 1,
      lastAttempt: { id: 'старая', status: 'submitted', expired: true },
    });

    expect(resolveTaskStartTarget(exam)).toEqual({ kind: 'start' });
  });
});
