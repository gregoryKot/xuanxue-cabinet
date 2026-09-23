// Какую кнопку показать — тестирует shared/src/my-exams.spec.ts
// (getMyExamAction, ADR-0091, переезд из этого файла); здесь остались только
// тексты кабинета, которые от кнопки не зависят.
import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import {
  describeExamState,
  describeOutcome,
  dueAtLine,
  examTimeZoneNote,
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

  it('склонение — 5 попыток', () => {
    expect(formatAttemptsLeft(makeExam({ attemptsAllowed: 5, attemptsUsed: 0 }))).toBe(
      'Осталось 5 попыток',
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

describe('describeExamState', () => {
  // Попытки не было, начать можно: строке сказать нечего — рядом стоят
  // «Осталось N попыток» и кнопка «Начать» (ADR-0120).
  it('ещё не приступал — строки нет вовсе', () => {
    expect(describeExamState(makeExam())).toBeNull();
  });

  it('попытка открыта и не закончена', () => {
    expect(
      describeExamState(
        makeExam({ lastAttempt: { id: 'a1', status: 'in_progress', expired: false } }),
      ),
    ).toBe('Попытка не закончена');
  });

  it('отправлено — сдал сам', () => {
    expect(
      describeExamState(
        makeExam({ lastAttempt: { id: 'a1', status: 'submitted', expired: false } }),
      ),
    ).toBe('Отправлено, ждём проверки');
  });

  // Попытку закрыло время: строка говорит и что случилось, и куда делась
  // работа — планировщик отправляет её учителю тем же путём, что и обычную
  // сдачу (api/src/exams/exam-deadline-close.service.ts).
  it('время закрыло попытку — сказано и про время, и про проверку', () => {
    expect(
      describeExamState(
        makeExam({
          attemptsAllowed: 2,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: true },
        }),
      ),
    ).toBe('Время вышло, попытка ушла на проверку');
  });

  // Тот же текст и когда попыток больше не осталось: кнопки «Пройти ещё раз»
  // тут нет (getMyExamAction вернул бы null из-за лимита), а работа у
  // учителя — и сказать об этом нужно так же честно.
  it('время закрыло попытку, лимит исчерпан — текст тот же', () => {
    expect(
      describeExamState(
        makeExam({
          attemptsAllowed: 1,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: true },
        }),
      ),
    ).toBe('Время вышло, попытка ушла на проверку');
  });

  it('помечено проверенным — запасной текст на случай, если оценки ещё нет', () => {
    expect(
      describeExamState(
        makeExam({ lastAttempt: { id: 'a1', status: 'graded', expired: false } }),
      ),
    ).toBe('Экзамен проверен');
  });

  it('попыток не открыто вовсе', () => {
    expect(describeExamState(makeExam({ attemptsAllowed: 0 }))).toBe(
      'Попыток по этому экзамену пока нет',
    );
  });
});

describe('examTimeZoneNote', () => {
  it('часы зрителя не школьные — называем пояс школы', () => {
    expect(examTimeZoneNote('Europe/Moscow')).toBe(
      'по вашим часам (школа живёт по Asia/Jerusalem)',
    );
  });

  it('зритель живёт по часам школы — приписки нет', () => {
    expect(examTimeZoneNote('Asia/Jerusalem')).toBeNull();
  });
});

describe('dueAtLine', () => {
  it('нет срока — строки нет вовсе', () => {
    expect(dueAtLine(undefined)).toBeNull();
  });

  it('есть срок — дата и час, с фиксированным поясом', () => {
    expect(dueAtLine('2026-09-30T20:59:00Z', 'Asia/Jerusalem')).toBe(
      'Сдать до Ср, 30 сентября, 23:59',
    );
  });
});
