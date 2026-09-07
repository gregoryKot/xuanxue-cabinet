import { describe, expect, it } from 'vitest';
import { MS_IN_WEEK, shiftByWeeks } from './dateWindow';

describe('shiftByWeeks', () => {
  it('положительный сдвиг — ровно N недель в миллисекундах вперёд', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const shifted = shiftByWeeks(now, 4);
    expect(shifted.getTime() - now.getTime()).toBe(4 * MS_IN_WEEK);
  });

  it('отрицательный сдвиг — ровно N недель назад', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const shifted = shiftByWeeks(now, -2);
    expect(now.getTime() - shifted.getTime()).toBe(2 * MS_IN_WEEK);
  });

  it('ноль недель — та же миллисекунда', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    expect(shiftByWeeks(now, 0).getTime()).toBe(now.getTime());
  });

  it('исходная дата не мутируется', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const before = now.getTime();
    shiftByWeeks(now, 8);
    expect(now.getTime()).toBe(before);
  });
});
