import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import {
  describeNoAction,
  describeOutcome,
  formatAttemptsLeft,
  getAttemptsLeft,
  getExamAction,
} from './examAttemptState';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('getAttemptsLeft', () => {
  it('разница попыток', () => {
    expect(getAttemptsLeft(makeExam({ attemptsAllowed: 3, attemptsUsed: 1 }))).toBe(2);
  });

  it('не уходит в минус, когда учитель уменьшил лимит', () => {
    expect(getAttemptsLeft(makeExam({ attemptsAllowed: 1, attemptsUsed: 2 }))).toBe(0);
  });
});

describe('formatAttemptsLeft', () => {
  it('склонение — 1 попытка', () => {
    expect(formatAttemptsLeft(makeExam({ attemptsAllowed: 1, attemptsUsed: 0 }))).toBe(
      'Осталось 1 попытка',
    );
  });

  it('склонение — 2 попытки', () => {
    expect(formatAttemptsLeft(makeExam({ attemptsAllowed: 2, attemptsUsed: 0 }))).toBe(
      'Осталось 2 попытки',
    );
  });

  it('ноль — честная строка, не «0 попыток»', () => {
    expect(formatAttemptsLeft(makeExam({ attemptsAllowed: 1, attemptsUsed: 1 }))).toBe(
      'Попытки закончились',
    );
  });
});

describe('getExamAction', () => {
  it('попытка в работе — «Продолжить», даже если лимит уже исчерпан', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'in_progress' },
    });
    expect(getExamAction(exam)).toBe('continue');
  });

  it('попыток не начинали, лимит не исчерпан — «Начать»', () => {
    expect(getExamAction(makeExam({ attemptsAllowed: 1, attemptsUsed: 0 }))).toBe(
      'start',
    );
  });

  it('лимит исчерпан, попытки не было (attemptsAllowed=0) — кнопки нет', () => {
    expect(getExamAction(makeExam({ attemptsAllowed: 0, attemptsUsed: 0 }))).toBeNull();
  });

  it('последняя попытка отправлена — кнопки нет', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted' },
    });
    expect(getExamAction(exam)).toBeNull();
  });

  it('последняя попытка проверена, попытки кончились — кнопки нет', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded' },
    });
    expect(getExamAction(exam)).toBeNull();
  });

  // Слой 4.7: итог «нужно доработать» без кнопки был бы тупиком.
  it('работу проверили, попытка ещё есть — «Пройти ещё раз»', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded', outcome: 'needs_work' },
    });
    expect(getExamAction(exam)).toBe('retry');
  });

  it('сдано и ждёт проверки, попытка ещё есть — кнопки нет: проверку не обходят', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted' },
    });
    expect(getExamAction(exam)).toBeNull();
  });
});

describe('describeOutcome', () => {
  it('сдал', () => {
    expect(describeOutcome('passed')).toBe('Экзамен сдан');
  });

  it('не сдал', () => {
    expect(describeOutcome('failed')).toBe('Экзамен не сдан');
  });

  it('нужно доработать', () => {
    expect(describeOutcome('needs_work')).toBe('Нужно доработать');
  });
});

describe('describeNoAction', () => {
  it('проверено', () => {
    expect(
      describeNoAction(makeExam({ lastAttempt: { id: 'a1', status: 'graded' } })),
    ).toBe('Экзамен проверен');
  });

  it('отправлено', () => {
    expect(
      describeNoAction(makeExam({ lastAttempt: { id: 'a1', status: 'submitted' } })),
    ).toBe('Отправлено, ждём проверки');
  });

  it('попыток не открыто вовсе', () => {
    expect(describeNoAction(makeExam({ attemptsAllowed: 0 }))).toBe(
      'Учитель пока не открыл ни одной попытки',
    );
  });
});
