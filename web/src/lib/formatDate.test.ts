// Пояс фиксирован явно ('Europe/Moscow', 'UTC') во всех проверках формата —
// тест не должен зависеть от системного TZ раннера CI (docs/RUNBOOK.md не
// требует TZ=... для web, в отличие от api/jest).
import { describe, expect, it } from 'vitest';
import {
  dateKey,
  formatDateTime,
  formatDayHeading,
  formatTime,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './formatDate';

const MONDAY_EVENING = '2026-09-07T16:30:00.000Z'; // Пн 19:30 в Europe/Moscow (+3)

describe('formatTime', () => {
  it('часы:минуты в заданном поясе, 24-часовой формат', () => {
    expect(formatTime(MONDAY_EVENING, 'Europe/Moscow')).toBe('19:30');
    expect(formatTime(MONDAY_EVENING, 'UTC')).toBe('16:30');
  });
});

describe('formatDayHeading', () => {
  it('день недели по-русски + число и месяц, в заданном поясе', () => {
    expect(formatDayHeading(MONDAY_EVENING, 'Europe/Moscow')).toBe('Пн, 7 сентября');
    // В UTC то же мгновение — тоже понедельник, дата не съезжает.
    expect(formatDayHeading(MONDAY_EVENING, 'UTC')).toBe('Пн, 7 сентября');
  });

  it('переход через полночь пояса меняет календарный день', () => {
    const lateUtc = '2026-09-07T22:15:00.000Z'; // 01:15 Вт в Europe/Moscow
    expect(formatDayHeading(lateUtc, 'Europe/Moscow')).toBe('Вт, 8 сентября');
  });
});

describe('formatDateTime', () => {
  it('склеивает заголовок дня и время через запятую', () => {
    expect(formatDateTime(MONDAY_EVENING, 'Europe/Moscow')).toBe('Пн, 7 сентября, 19:30');
  });
});

describe('dateKey', () => {
  it('YYYY-MM-DD в заданном поясе — общий ключ для группировки по дню', () => {
    expect(dateKey(MONDAY_EVENING, 'Europe/Moscow')).toBe('2026-09-07');
    expect(dateKey('2026-09-07T22:15:00.000Z', 'Europe/Moscow')).toBe('2026-09-08');
  });
});

describe('toDatetimeLocalValue / fromDatetimeLocalValue — круговой обход', () => {
  it('значение datetime-local из ISO и обратно даёт то же мгновение', () => {
    const iso = '2026-09-07T16:30:00.000Z';
    const local = toDatetimeLocalValue(iso);
    // Формат ровно как ждёт <input type="datetime-local">: YYYY-MM-DDTHH:mm.
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDatetimeLocalValue(local)).toBe(iso);
  });

  it('пустая строка и мусор — null, а не Invalid Date', () => {
    expect(fromDatetimeLocalValue('')).toBeNull();
    expect(fromDatetimeLocalValue('не дата')).toBeNull();
  });
});
