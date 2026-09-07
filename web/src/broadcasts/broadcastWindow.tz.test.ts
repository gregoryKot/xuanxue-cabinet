// Регрессия на переход времени Asia/Jerusalem (CLAUDE.md «тест на переход
// летнего времени... обязателен для любого кода, который считает „когда“»;
// pr-k3-fixes.md п.1) — отдельный файл, `process.env.TZ` глобален для
// процесса (см. planning/planningWindow.tz.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { journalWindow } from './broadcastWindow';

describe('journalWindow — переход времени Asia/Jerusalem', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'Asia/Jerusalem');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('8 недель через переход на зимнее время (2026-10-25) — окно ровно 56 суток', () => {
    const now = new Date('2026-10-30T10:00:00Z');
    const { from, to } = journalWindow(8, now);
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(56);
  });

  it('8 недель через переход на летнее время (2026-03-27) — окно ровно 56 суток', () => {
    const now = new Date('2026-04-01T10:00:00Z');
    const { from, to } = journalWindow(8, now);
    const days =
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(56);
  });
});
