// Диф в миллисекундах, без обращения к часовому поясу — тест проходит
// одинаково и в UTC, и под TZ=Australia/Sydney (CLAUDE.md «Время»).
import { describe, expect, it } from 'vitest';
import { getAttemptTimeStatus } from './attemptDeadline';

const NOW = new Date('2026-09-12T10:00:00Z').getTime();

describe('getAttemptTimeStatus', () => {
  it('без дедлайна — форма без лимита времени', () => {
    expect(getAttemptTimeStatus(undefined, NOW)).toEqual({
      hasDeadline: false,
      expired: false,
      label: null,
    });
  });

  it('осталось 15 минут', () => {
    const deadline = new Date(NOW + 15 * 60_000).toISOString();
    expect(getAttemptTimeStatus(deadline, NOW)).toEqual({
      hasDeadline: true,
      expired: false,
      label: 'Осталось 15 минут',
    });
  });

  it('склонение — 1 минута', () => {
    const deadline = new Date(NOW + 1 * 60_000).toISOString();
    expect(getAttemptTimeStatus(deadline, NOW).label).toBe('Осталось 1 минута');
  });

  it('меньше минуты — не «0 минут»', () => {
    const deadline = new Date(NOW + 30_000).toISOString();
    expect(getAttemptTimeStatus(deadline, NOW).label).toBe('Осталось меньше минуты');
  });

  it('дедлайн в прошлом — expired, без label', () => {
    const deadline = new Date(NOW - 1000).toISOString();
    expect(getAttemptTimeStatus(deadline, NOW)).toEqual({
      hasDeadline: true,
      expired: true,
      label: null,
    });
  });

  it('дедлайн ровно сейчас — тоже expired (сервер закрывает по «>=»)', () => {
    expect(getAttemptTimeStatus(new Date(NOW).toISOString(), NOW).expired).toBe(true);
  });
});
