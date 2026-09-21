// Какую кнопку показать — тестирует shared/src/my-exams.spec.ts
// (getMyExamAction, ADR-0091, переезд из этого файла); здесь остались только
// тексты кабинета, которые от кнопки не зависят.
import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import {
  describeNoAction,
  describeOutcome,
  formatAttemptsLeft,
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
      describeNoAction(
        makeExam({ lastAttempt: { id: 'a1', status: 'graded', expired: false } }),
      ),
    ).toBe('Экзамен проверен');
  });

  it('отправлено — сдал сам', () => {
    expect(
      describeNoAction(
        makeExam({ lastAttempt: { id: 'a1', status: 'submitted', expired: false } }),
      ),
    ).toBe('Отправлено, ждём проверки');
  });

  // Тот же текст и когда попытку закрыло время, но попыток больше не
  // осталось: карточка тут не рисует кнопку «Пройти ещё раз» (getMyExamAction
  // вернул бы null из-за исчерпанного лимита), а работа всё равно ждёт
  // проверки учителя — сообщать об этом нужно тем же честным текстом.
  it('отправлено — закрыло время, но лимит попыток уже исчерпан', () => {
    expect(
      describeNoAction(
        makeExam({
          attemptsAllowed: 1,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: true },
        }),
      ),
    ).toBe('Отправлено, ждём проверки');
  });

  it('попыток не открыто вовсе', () => {
    expect(describeNoAction(makeExam({ attemptsAllowed: 0 }))).toBe(
      'Учитель пока не открыл ни одной попытки',
    );
  });
});
