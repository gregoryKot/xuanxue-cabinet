// Регрессия на переход летнего/зимнего времени Asia/Jerusalem (CLAUDE.md
// «тест на переход летнего времени Asia/Jerusalem обязателен для любого
// кода, который считает „когда“»; pr-k3-fixes.md п.1). Отдельный файл, не
// блок в dateWindow.test.ts — `process.env.TZ` глобален для процесса, стаб
// должен жить и сняться в своём модуле (см. planning/planningWindow.tz.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MS_IN_WEEK, shiftByWeeks } from './dateWindow';

describe('shiftByWeeks — переход времени Asia/Jerusalem', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'Asia/Jerusalem');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('переход на зимнее время (2026-10-25) — 8 недель (журнал) ровно в UTC', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const shifted = shiftByWeeks(now, 8);
    expect(shifted.getTime() - now.getTime()).toBe(8 * MS_IN_WEEK);
  });

  it('переход на летнее время (2026-03-27) — 8 недель (журнал) ровно в UTC', () => {
    const now = new Date('2026-03-22T10:00:00Z');
    const shifted = shiftByWeeks(now, 8);
    expect(shifted.getTime() - now.getTime()).toBe(8 * MS_IN_WEEK);
  });

  it('окно назад через переход (журнал, отрицательный сдвиг) — тоже точное', () => {
    const now = new Date('2026-10-30T10:00:00Z');
    const shifted = shiftByWeeks(now, -8);
    expect(now.getTime() - shifted.getTime()).toBe(8 * MS_IN_WEEK);
  });
});
