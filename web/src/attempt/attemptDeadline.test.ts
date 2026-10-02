// Диф в миллисекундах, без обращения к часовому поясу — тест проходит
// одинаково и в UTC, и под TZ=Australia/Sydney (CLAUDE.md «Время»).
import { describe, expect, it } from 'vitest';
import { getAttemptTimeStatus, getRemainingTimeStatus } from './attemptDeadline';

const NOW = new Date('2026-09-12T10:00:00Z').getTime();

function statusIn(ms: number) {
  return getAttemptTimeStatus(new Date(NOW + ms).toISOString(), NOW);
}

describe('getAttemptTimeStatus', () => {
  it('без дедлайна — форма без лимита времени', () => {
    expect(getAttemptTimeStatus(undefined, NOW)).toEqual({
      hasDeadline: false,
      expired: false,
      label: null,
      warning: false,
      announcement: null,
    });
  });

  it('два часа ровно — без «0 мин»', () => {
    expect(statusIn(2 * 60 * 60_000).label).toBe('Осталось 2 ч');
  });

  it('2 ч 15 мин', () => {
    expect(statusIn(2 * 60 * 60_000 + 15 * 60_000).label).toBe('Осталось 2 ч 15 мин');
  });

  it('меньше часа — М:СС, минуты без ведущего нуля', () => {
    expect(statusIn(12 * 60_000 + 34_000).label).toBe('Осталось 12:34');
  });

  it('меньше минуты — секунды всегда двумя знаками', () => {
    expect(statusIn(7000).label).toBe('Осталось 0:07');
  });

  it('порог предупреждения — ровно 5:00 ещё не тревожный тон', () => {
    const status = statusIn(5 * 60_000);
    expect(status.label).toBe('Осталось 5:00');
    expect(status.warning).toBe(false);
  });

  it('порог предупреждения — 4:59 уже тревожный тон', () => {
    const status = statusIn(4 * 60_000 + 59_000);
    expect(status.label).toBe('Осталось 4:59');
    expect(status.warning).toBe(true);
  });

  it('announcement — молчит, пока осталось больше 5 минут', () => {
    expect(statusIn(6 * 60_000).announcement).toBeNull();
  });

  it('announcement — «меньше 5 минут» под порогом предупреждения', () => {
    expect(statusIn(4 * 60_000 + 59_000).announcement).toBe('Осталось меньше 5 минут');
  });

  it('announcement — «меньше минуты» на последней минуте', () => {
    expect(statusIn(59_000).announcement).toBe('Осталось меньше минуты');
  });

  it('дедлайн в прошлом — expired, без label, без предупреждения', () => {
    expect(getAttemptTimeStatus(new Date(NOW - 1000).toISOString(), NOW)).toEqual({
      hasDeadline: true,
      expired: true,
      label: null,
      warning: false,
      announcement: null,
    });
  });

  it('дедлайн ровно сейчас — тоже expired (сервер закрывает по «>=»)', () => {
    expect(getAttemptTimeStatus(new Date(NOW).toISOString(), NOW).expired).toBe(true);
  });
});

// Остаток в миллисекундах без строки дедлайна — так считает предпросмотр
// экзамена (exams/ExamPreviewTimer.tsx), у которого есть только лимит в минутах.
describe('getRemainingTimeStatus', () => {
  it('45 минут — «Осталось 45:00», тревожного тона нет', () => {
    const status = getRemainingTimeStatus(45 * 60_000);
    expect(status.label).toBe('Осталось 45:00');
    expect(status.warning).toBe(false);
    expect(status.expired).toBe(false);
  });

  it('90 минут — «Осталось 1 ч 30 мин»', () => {
    expect(getRemainingTimeStatus(90 * 60_000).label).toBe('Осталось 1 ч 30 мин');
  });

  it('4 минуты — тревожный тон и фраза для скринридера «меньше 5 минут»', () => {
    const status = getRemainingTimeStatus(4 * 60_000);
    expect(status.warning).toBe(true);
    expect(status.announcement).toBe('Осталось меньше 5 минут');
  });

  it('ноль — expired, без label', () => {
    const status = getRemainingTimeStatus(0);
    expect(status.expired).toBe(true);
    expect(status.label).toBeNull();
  });

  it('тот же результат, что у getAttemptTimeStatus на тот же остаток', () => {
    expect(getRemainingTimeStatus(7 * 60_000 + 3000)).toEqual(
      statusIn(7 * 60_000 + 3000),
    );
  });
});
