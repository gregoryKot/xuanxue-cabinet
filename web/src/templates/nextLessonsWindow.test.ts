import { describe, expect, it } from 'vitest';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { nextLessonsWindow } from './nextLessonsWindow';

describe('nextLessonsWindow', () => {
  it('начало окна — переданный момент, округлённый вниз до минуты', () => {
    expect(nextLessonsWindow(new Date('2026-09-07T12:00:00Z')).from).toBe(
      '2026-09-07T12:00:00.000Z',
    );
    // Секунды и миллисекунды отбрасываются: ключ предзагрузки и хука должны
    // совпасть, хотя их считают в разные моменты (см. комментарий функции).
    expect(nextLessonsWindow(new Date('2026-09-07T12:00:37.421Z')).from).toBe(
      '2026-09-07T12:00:00.000Z',
    );
  });

  it('конец окна — ровно PLANNING_HORIZON_WEEKS недель после начала', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const { from, to } = nextLessonsWindow(now);
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(PLANNING_HORIZON_WEEKS * 7);
  });
});
