import { describe, expect, it } from 'vitest';
import { planningWindow } from './planningWindow';

describe('planningWindow', () => {
  it('начало окна — воскресенье, полночь по местному времени', () => {
    const { from } = planningWindow(new Date('2026-09-09T13:45:00Z')); // среда
    const start = new Date(from);
    expect(start.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('конец окна — ровно 4 недели (28 дней) после начала', () => {
    const { from, to } = planningWindow(new Date('2026-09-09T13:45:00Z'));
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(28);
  });

  it('вызов в само воскресенье не сдвигает начало на неделю назад', () => {
    const sunday = new Date('2026-09-06T10:00:00Z'); // воскресенье
    const { from } = planningWindow(sunday);
    const start = new Date(from);
    expect(start.getDay()).toBe(0);
    // Дата начала окна — тот же календарный день, что у `sunday`, не предыдущий.
    expect(start.getDate()).toBe(sunday.getDate());
  });
});
