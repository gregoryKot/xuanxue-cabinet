// Регрессия на переход зимнего времени Asia/Jerusalem (CLAUDE.md
// «Только Luxon... тест на переход обязателен для любого кода, который
// считает „когда“» — здесь дата на клиенте, без Luxon, тест на `TZ` env).
// Отдельный файл, не блок в planningWindow.test.ts: `process.env.TZ`
// глобален для процесса, стаб должен жить и сняться в своём модуле.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planningWindow } from './planningWindow';

describe('planningWindow — переход зимнего времени Asia/Jerusalem', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'Asia/Jerusalem');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('окно 4 недели от 2026-10-04 — ровно 28 суток в UTC, несмотря на перевод стрелок', () => {
    // 2026-10-04 — воскресенье; перевод на зимнее время в Израиле — 2026-10-25,
    // внутри этого окна. `setDate(+28)` держал бы локальную полночь и давал
    // разницу 28 дней ± 1 час — сервер отвечал 400 (see planningWindow.ts).
    const { from, to } = planningWindow(new Date('2026-10-04T10:00:00Z'));
    const diffMs = new Date(to).getTime() - new Date(from).getTime();
    expect(diffMs).toBe(28 * 24 * 60 * 60 * 1000);
  });
});
