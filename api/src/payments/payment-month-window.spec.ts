// Чистая функция, без Mongo (CLAUDE.md «Тесты»): границы окна и переход
// года — тот же приём, что shiftMonth.spec (shared).
import { DateTime } from 'luxon';
import { isPaymentMonthInWindow } from './payment-month-window';

const TZ = 'Asia/Jerusalem';
const NOW = DateTime.fromISO('2026-09-15T10:00:00', { zone: TZ });

describe('isPaymentMonthInWindow', () => {
  it('текущий месяц — в окне', () => {
    expect(isPaymentMonthInWindow('2026-09', NOW, TZ)).toBe(true);
  });

  it('ровно 11 месяцев назад (левая граница) — в окне', () => {
    expect(isPaymentMonthInWindow('2025-10', NOW, TZ)).toBe(true);
  });

  it('12 месяцев назад (за левой границей) — вне окна', () => {
    expect(isPaymentMonthInWindow('2025-09', NOW, TZ)).toBe(false);
  });

  it('ровно на месяц вперёд (правая граница) — в окне', () => {
    expect(isPaymentMonthInWindow('2026-10', NOW, TZ)).toBe(true);
  });

  it('на два месяца вперёд (за правой границей) — вне окна', () => {
    expect(isPaymentMonthInWindow('2026-11', NOW, TZ)).toBe(false);
  });

  it('переход года — 11 месяцев назад от января', () => {
    const nowInJanuary = DateTime.fromISO('2026-01-15T10:00:00', { zone: TZ });
    expect(isPaymentMonthInWindow('2025-02', nowInJanuary, TZ)).toBe(true);
    expect(isPaymentMonthInWindow('2025-01', nowInJanuary, TZ)).toBe(false);
  });

  it('подделанная ссылка далеко в будущем — вне окна', () => {
    expect(isPaymentMonthInWindow('2099-12', NOW, TZ)).toBe(false);
  });
});
