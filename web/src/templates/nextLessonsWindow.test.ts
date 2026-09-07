import { describe, expect, it } from 'vitest';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { nextLessonsWindow } from './nextLessonsWindow';

describe('nextLessonsWindow', () => {
  it('начало окна — переданный момент как есть', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    expect(nextLessonsWindow(now).from).toBe(now.toISOString());
  });

  it('конец окна — ровно PLANNING_HORIZON_WEEKS недель после начала', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const { from, to } = nextLessonsWindow(now);
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(PLANNING_HORIZON_WEEKS * 7);
  });
});
