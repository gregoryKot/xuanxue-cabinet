// Время экзамена словами (describeExamTime, ADR-0122) — чистая функция, без
// Mongo, DOM и сети. Момент «сейчас» и пояс приходят параметрами, поэтому
// тест не зависит ни от часов машины, ни от её пояса (CLAUDE.md
// «Детерминизм»): CI гоняет vitest под UTC и Australia/Sydney.
import { describe, expect, it } from 'vitest';
import { describeAttemptDeadline, describeExamTime, isExamDuePassed } from './exam-time';
import type { MyExamDto } from './my-exams';

const SCHOOL_TZ = 'Asia/Jerusalem';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 2,
    attemptsUsed: 0,
    ...overrides,
  };
}

function inProgress(deadlineAt: string | undefined): MyExamDto['lastAttempt'] {
  return { id: 'a1', status: 'in_progress', expired: false, deadlineAt };
}

/** Момент в миллисекундах из ISO — `Date.parse`, а не `new Date(строка)`
 * (запрещён в shared, CLAUDE.md «Время»). */
function ms(iso: string): number {
  return Date.parse(iso);
}

describe('describeExamTime — форма без лимита', () => {
  it('строки нет вовсе', () => {
    expect(
      describeExamTime(makeExam(), { nowMs: ms('2026-09-22T10:00:00Z') }),
    ).toBeNull();
  });
});

describe('describeExamTime — попытки ещё не было', () => {
  it('сколько времени даётся на попытку', () => {
    expect(
      describeExamTime(makeExam({ timeLimitMin: 40 }), {
        nowMs: ms('2026-09-22T10:00:00Z'),
      }),
    ).toBe('На попытку даётся 40 минут');
  });

  it('час с половиной — часами, как в шаблонах постов', () => {
    expect(
      describeExamTime(makeExam({ timeLimitMin: 90 }), {
        nowMs: ms('2026-09-22T10:00:00Z'),
      }),
    ).toBe('На попытку даётся 1,5 часа');
  });

  it('прошлая попытка закрыта — снова про продолжительность, не про остаток', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });

    expect(describeExamTime(exam, { nowMs: ms('2026-09-22T10:00:00Z') })).toBe(
      'На попытку даётся 40 минут',
    );
  });
});

describe('describeExamTime — попытка идёт', () => {
  it('остаток и час закрытия по часам зрителя', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      attemptsUsed: 1,
      lastAttempt: inProgress('2026-09-22T16:40:00Z'),
    });

    expect(
      describeExamTime(exam, {
        nowMs: ms('2026-09-22T16:15:00Z'),
        timeZone: 'Europe/Moscow',
      }),
    ).toBe('Осталось 25 мин, попытка закроется в 19:40');
  });

  it('больше часа — часы и минуты; ровный час — без «0 мин»', () => {
    const exam = makeExam({
      timeLimitMin: 600,
      lastAttempt: inProgress('2026-09-22T18:15:00Z'),
    });
    const options = { nowMs: ms('2026-09-22T16:00:00Z'), timeZone: SCHOOL_TZ };

    expect(describeExamTime(exam, options)).toBe(
      'Осталось 2 ч 15 мин, попытка закроется в 21:15',
    );
    expect(
      describeExamTime(
        makeExam({ timeLimitMin: 600, lastAttempt: inProgress('2026-09-22T18:00:00Z') }),
        options,
      ),
    ).toBe('Осталось 2 ч, попытка закроется в 21:00');
  });

  it('последняя минута округляется вверх — «1 мин» у ещё открытой попытки', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      lastAttempt: inProgress('2026-09-22T16:40:00Z'),
    });

    expect(
      describeExamTime(exam, {
        nowMs: ms('2026-09-22T16:39:59Z'),
        timeZone: SCHOOL_TZ,
      }),
    ).toBe('Осталось 1 мин, попытка закроется в 19:40');
  });

  it('закроется уже завтра — с датой, иначе час читался бы как сегодняшний', () => {
    const exam = makeExam({
      timeLimitMin: 600,
      lastAttempt: inProgress('2026-09-22T23:00:00Z'),
    });

    expect(
      describeExamTime(exam, {
        nowMs: ms('2026-09-22T20:00:00Z'),
        timeZone: SCHOOL_TZ,
      }),
    ).toBe('Осталось 3 ч, попытка закроется 23 сентября в 02:00');
  });

  it('приписка про часы идёт сразу за временем', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      lastAttempt: inProgress('2026-09-22T16:40:00Z'),
    });

    expect(
      describeExamTime(exam, {
        nowMs: ms('2026-09-22T16:15:00Z'),
        timeZone: SCHOOL_TZ,
        zoneNote: `(${SCHOOL_TZ})`,
      }),
    ).toBe('Осталось 25 мин, попытка закроется в 19:40 (Asia/Jerusalem)');
  });

  it('дедлайн прошёл, а закрытие ещё не доехало — «время вышло», не минус', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      lastAttempt: inProgress('2026-09-22T16:40:00Z'),
    });

    expect(
      describeExamTime(exam, { nowMs: ms('2026-09-22T16:40:00Z'), timeZone: SCHOOL_TZ }),
    ).toBe('Время попытки вышло');
  });

  it('дедлайна у попытки нет — говорим про продолжительность', () => {
    const exam = makeExam({ timeLimitMin: 40, lastAttempt: inProgress(undefined) });

    expect(describeExamTime(exam, { nowMs: ms('2026-09-22T16:15:00Z') })).toBe(
      'На попытку даётся 40 минут',
    );
  });

  it('дедлайн в ответе нечитаемый — продолжительность вместо «NaN мин»', () => {
    const exam = makeExam({ timeLimitMin: 40, lastAttempt: inProgress('не дата') });

    expect(describeExamTime(exam, { nowMs: ms('2026-09-22T16:15:00Z') })).toBe(
      'На попытку даётся 40 минут',
    );
  });
});

// Переход на летнее время Asia/Jerusalem обязателен для любого кода, который
// считает «когда» (CLAUDE.md «Время»). Остаток — настоящие минуты между двумя
// моментами, а час закрытия — стена часов ПОСЛЕ перевода: смещение зоны в
// середине попытки меняется, и арифметика «остаток + смещение старта»
// промахнулась бы ровно на час.
describe('describeExamTime — переход времени Asia/Jerusalem', () => {
  it('осень: 03:00 IDT становятся 02:00 IST посреди попытки', () => {
    // Перевод 2026-10-24T23:00:00Z (UTC+3 → UTC+2). Начало попытки — 01:30
    // по Иерусалиму, дедлайн через два часа реального времени: 02:30, а не
    // 03:30.
    const exam = makeExam({
      timeLimitMin: 120,
      lastAttempt: inProgress('2026-10-25T00:30:00Z'),
    });

    expect(
      describeExamTime(exam, {
        nowMs: ms('2026-10-24T22:30:00Z'),
        timeZone: SCHOOL_TZ,
      }),
    ).toBe('Осталось 2 ч, попытка закроется в 02:30');
  });

  it('весна: 02:00 IST становятся 03:00 IDT посреди попытки', () => {
    // Перевод 2026-03-27T00:00:00Z (UTC+2 → UTC+3). Два часа реального
    // времени от 01:30 приводят к 04:30 по стене, а не к 03:30.
    const exam = makeExam({
      timeLimitMin: 120,
      lastAttempt: inProgress('2026-03-27T01:30:00Z'),
    });

    expect(
      describeExamTime(exam, {
        nowMs: ms('2026-03-26T23:30:00Z'),
        timeZone: SCHOOL_TZ,
      }),
    ).toBe('Осталось 2 ч, попытка закроется в 04:30');
  });
});

// Отдельная функция для боте на экране вопроса (exam-question-render.ts,
// отзыв владельца 2026-09-22): на руках только ExamAttemptDto.deadlineAt,
// без лимита формы. describeExamTime выше делегирует ей же — совпадение
// формулировок проверяют тесты describeExamTime, здесь — сама функция и её
// собственный случай (нечитаемый дедлайн), которого у describeExamTime не
// увидеть напрямую (там он тонет в фолбэке на limitLine).
describe('describeAttemptDeadline', () => {
  it('остаток и час закрытия — как в describeExamTime', () => {
    expect(
      describeAttemptDeadline('2026-09-22T16:40:00Z', {
        nowMs: ms('2026-09-22T16:15:00Z'),
        timeZone: SCHOOL_TZ,
        zoneNote: `(${SCHOOL_TZ})`,
      }),
    ).toBe('Осталось 25 мин, попытка закроется в 19:40 (Asia/Jerusalem)');
  });

  it('дедлайн прошёл — «время вышло»', () => {
    expect(
      describeAttemptDeadline('2026-09-22T16:40:00Z', {
        nowMs: ms('2026-09-22T16:40:00Z'),
      }),
    ).toBe('Время попытки вышло');
  });

  it('дедлайн нечитаемый — null, не «время вышло» и не NaN', () => {
    expect(
      describeAttemptDeadline('не дата', { nowMs: ms('2026-09-22T16:15:00Z') }),
    ).toBeNull();
  });
});

// ADR-0125: срок сдачи — второе, независимое от лимита минут ограничение.
// Сравнение абсолютных моментов (Date.parse), пояс тут ни при чём — но
// CLAUDE.md «Время» требует тест на переход Asia/Jerusalem для любого кода,
// который решает «когда» (тест ниже), хотя бы чтобы зафиксировать, что
// сравнение UTC-моментов ни на минуту не сдвигается переводом стрелок.
describe('isExamDuePassed', () => {
  it('нет срока — не прошёл', () => {
    expect(isExamDuePassed(undefined, ms('2026-09-22T10:00:00Z'))).toBe(false);
  });

  it('срок ещё впереди — не прошёл', () => {
    expect(isExamDuePassed('2026-09-30T20:59:00Z', ms('2026-09-22T10:00:00Z'))).toBe(
      false,
    );
  });

  it('срок уже наступил — прошёл', () => {
    expect(isExamDuePassed('2026-09-30T20:59:00Z', ms('2026-09-30T20:59:00Z'))).toBe(
      true,
    );
  });

  it('срок в прошлом — прошёл', () => {
    expect(isExamDuePassed('2026-09-30T20:59:00Z', ms('2026-10-01T00:00:00Z'))).toBe(
      true,
    );
  });

  it('дедлайн нечитаемый — не прошёл (защита в глубину, не ложный отказ)', () => {
    expect(isExamDuePassed('не дата', ms('2026-09-22T10:00:00Z'))).toBe(false);
  });

  // Переход на зимнее время Asia/Jerusalem (последнее воскресенье октября,
  // 2026-10-25): срок сдачи — момент незадолго до перехода по UTC. Минута
  // до него ещё «не прошёл», минута после — уже «прошёл», ровно так же, как
  // если бы перехода не было вовсе: сравнение UTC-моментов его не видит.
  it('переход на зимнее время Asia/Jerusalem — граница не сдвигается', () => {
    const dueAt = '2026-10-24T21:00:00Z';
    expect(isExamDuePassed(dueAt, ms('2026-10-24T20:59:00Z'))).toBe(false);
    expect(isExamDuePassed(dueAt, ms('2026-10-24T21:01:00Z'))).toBe(true);
  });
});
