// Правило «что предложить ученику дальше» — одно на кабинет и на бота
// (getMyExamAction, ADR-0093, решение владельца 2026-09-21). Чистая логика
// без DOM и без сети, тест на каждую из шести веток по порядку из функции.
import { describe, expect, it } from 'vitest';
import { getMyExamAction, myExamAttemptsLeft, type MyExamDto } from './my-exams';

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

describe('myExamAttemptsLeft', () => {
  it('разница попыток', () => {
    expect(myExamAttemptsLeft(makeExam({ attemptsAllowed: 3, attemptsUsed: 1 }))).toBe(2);
  });

  it('не уходит в минус, когда учитель уменьшил лимит формы', () => {
    expect(myExamAttemptsLeft(makeExam({ attemptsAllowed: 1, attemptsUsed: 2 }))).toBe(0);
  });
});

describe('getMyExamAction', () => {
  it('1. попытка в работе — «continue», даже если лимит уже исчерпан', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    expect(getMyExamAction(exam)).toBe('continue');
  });

  it('2. лимит попыток исчерпан — null, даже если последнюю закрыло время', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    expect(getMyExamAction(exam)).toBeNull();
  });

  it('2а. лимит исчерпан и попытки не было вовсе (attemptsAllowed: 0) — null', () => {
    expect(getMyExamAction(makeExam({ attemptsAllowed: 0, attemptsUsed: 0 }))).toBeNull();
  });

  it('3. попыток не начинали, лимит не исчерпан — «start»', () => {
    expect(getMyExamAction(makeExam({ attemptsAllowed: 1, attemptsUsed: 0 }))).toBe(
      'start',
    );
  });

  it('4. работу проверили — «retry» независимо от того, что было с дедлайном', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'graded',
        outcome: 'needs_work',
        expired: false,
      },
    });
    expect(getMyExamAction(exam)).toBe('retry');
  });

  it('5. сдано, но попытку закрыло время — «retry»: человек не успел, не обошёл проверку', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    expect(getMyExamAction(exam)).toBe('retry');
  });

  it('6. сдал сам и ждёт проверки — null: вторая попытка была бы обходом проверки', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    expect(getMyExamAction(exam)).toBeNull();
  });
});
