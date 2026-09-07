import { describe, expect, it } from 'vitest';
import { journalWindow } from './broadcastWindow';

const NOW = new Date('2026-09-07T12:00:00Z');

describe('journalWindow', () => {
  it('неделя — окно 7 дней, конец — переданный момент', () => {
    const { from, to } = journalWindow(1, NOW);
    expect(to).toBe(NOW.toISOString());
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(7);
  });

  it('2 недели — окно 14 дней', () => {
    const { from, to } = journalWindow(2, NOW);
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(14);
  });

  it('8 недель — окно 56 дней', () => {
    const { from, to } = journalWindow(8, NOW);
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(56);
  });
});
