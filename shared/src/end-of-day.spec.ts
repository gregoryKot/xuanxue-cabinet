// Конец дня в поясе школы (аудит 2026-10-01, F61) — чистая функция без
// Luxon; момент считается от явного пояса, поэтому результат не зависит от
// пояса машины (CI гоняет vitest под UTC и Australia/Sydney, CLAUDE.md
// «Детерминизм»). Переход летнего времени Asia/Jerusalem обязателен для
// любого кода, который считает «когда» (CLAUDE.md «Время»).
import { describe, expect, it } from 'vitest';
import { endOfDayInZoneIso } from './end-of-day';

const SCHOOL_TZ = 'Asia/Jerusalem';

describe('endOfDayInZoneIso — обычные дни', () => {
  it('зима Asia/Jerusalem (UTC+2) — 23:59:59.999 по часам школы', () => {
    expect(endOfDayInZoneIso('2026-01-15', SCHOOL_TZ)).toBe('2026-01-15T21:59:59.999Z');
  });

  it('лето Asia/Jerusalem (UTC+3)', () => {
    expect(endOfDayInZoneIso('2026-06-10', SCHOOL_TZ)).toBe('2026-06-10T20:59:59.999Z');
  });

  it('другой пояс даёт другой момент той же даты — пояс не захардкожен', () => {
    expect(endOfDayInZoneIso('2026-06-10', 'UTC')).toBe('2026-06-10T23:59:59.999Z');
    expect(endOfDayInZoneIso('2026-06-10', 'Europe/Berlin')).toBe(
      '2026-06-10T21:59:59.999Z',
    );
    // UTC+14 — конец дня наступает ещё «вчера» по UTC.
    expect(endOfDayInZoneIso('2026-06-10', 'Pacific/Kiritimati')).toBe(
      '2026-06-10T09:59:59.999Z',
    );
  });

  it('пояс с получасовым смещением — минуты смещения не теряются', () => {
    expect(endOfDayInZoneIso('2026-06-10', 'Asia/Kolkata')).toBe(
      '2026-06-10T18:29:59.999Z',
    );
  });
});

// Переход на летнее время 2026-03-27 (02:00 → 03:00) и на зимнее 2026-10-25
// (02:00 → 01:00): «до конца дня» — конец ИМЕННО этого дня по смещению,
// действующему в 23:59, не по тому, что было в полночь.
describe('endOfDayInZoneIso — переход времени Asia/Jerusalem', () => {
  it('день перехода на летнее время — смещение +3 уже в силе', () => {
    expect(endOfDayInZoneIso('2026-03-27', SCHOOL_TZ)).toBe('2026-03-27T20:59:59.999Z');
  });

  it('день перехода на зимнее время — смещение +2 уже в силе', () => {
    expect(endOfDayInZoneIso('2026-10-25', SCHOOL_TZ)).toBe('2026-10-25T21:59:59.999Z');
  });

  it('канун перехода — ещё старое смещение', () => {
    expect(endOfDayInZoneIso('2026-03-26', SCHOOL_TZ)).toBe('2026-03-26T21:59:59.999Z');
    expect(endOfDayInZoneIso('2026-10-24', SCHOOL_TZ)).toBe('2026-10-24T20:59:59.999Z');
  });
});

describe('endOfDayInZoneIso — кривой ввод', () => {
  it('пустая строка и мусор — null', () => {
    expect(endOfDayInZoneIso('', SCHOOL_TZ)).toBeNull();
    expect(endOfDayInZoneIso('не дата', SCHOOL_TZ)).toBeNull();
    expect(endOfDayInZoneIso('2026-1-5', SCHOOL_TZ)).toBeNull();
  });

  it('календарно невозможная дата — null, а не перенос на соседний месяц', () => {
    expect(endOfDayInZoneIso('2026-13-01', SCHOOL_TZ)).toBeNull();
    expect(endOfDayInZoneIso('2026-04-31', SCHOOL_TZ)).toBeNull();
    expect(endOfDayInZoneIso('2026-02-30', SCHOOL_TZ)).toBeNull();
  });

  it('29 февраля — только в високосный год', () => {
    expect(endOfDayInZoneIso('2024-02-29', SCHOOL_TZ)).toBe('2024-02-29T21:59:59.999Z');
    expect(endOfDayInZoneIso('2026-02-29', SCHOOL_TZ)).toBeNull();
  });
});
