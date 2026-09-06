// Юнит-тесты чистой логики разворачивания правил в моменты — без Mongo
// (CLAUDE.md «Тесты»). DST Asia/Jerusalem обязателен; CI гоняет этот файл
// ещё под TZ=Australia/Sydney — даты в тестах только с `Z` или явной зоной.
import { DateTime, Settings } from 'luxon';
import type { ScheduleRule } from '@xuanxue/shared';
import { planOccurrences } from './lesson-occurrences';

const TZ = 'Asia/Jerusalem';
const TUESDAY_19: ScheduleRule = { weekday: 2, time: '19:00', durationMin: 90 };
const SUNDAY_10: ScheduleRule = { weekday: 0, time: '10:00', durationMin: 60 };

const iso = (value: string) => DateTime.fromISO(value, { zone: 'utc' });

describe('planOccurrences — переход на летнее время Asia/Jerusalem', () => {
  afterEach(() => {
    Settings.defaultZone = 'system';
  });

  it('март: 24.03 → 17:00Z (+02:00), 31.03 → 16:00Z (+03:00)', () => {
    const occurrences = planOccurrences(
      TUESDAY_19,
      TZ,
      iso('2026-03-20T00:00:00Z'),
      iso('2026-04-01T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-03-24T17:00:00.000Z',
      '2026-03-31T16:00:00.000Z',
    ]);
  });

  it('октябрь: 20.10 → 16:00Z (+03:00), 27.10 → 17:00Z (+02:00)', () => {
    const occurrences = planOccurrences(
      TUESDAY_19,
      TZ,
      iso('2026-10-19T00:00:00Z'),
      iso('2026-10-28T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-10-20T16:00:00.000Z',
      '2026-10-27T17:00:00.000Z',
    ]);
  });

  it('не зависит от Settings.defaultZone процесса', () => {
    Settings.defaultZone = 'Australia/Sydney';
    const occurrences = planOccurrences(
      TUESDAY_19,
      TZ,
      iso('2026-03-20T00:00:00Z'),
      iso('2026-04-01T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-03-24T17:00:00.000Z',
      '2026-03-31T16:00:00.000Z',
    ]);
  });
});

describe('planOccurrences — воскресенье (weekday 0)', () => {
  it('переводит домен школы (0=Вс) в ISO-weekday Luxon (7=Вс)', () => {
    const occurrences = planOccurrences(
      SUNDAY_10,
      TZ,
      iso('2026-01-01T00:00:00Z'),
      iso('2026-01-08T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-01-04T08:00:00.000Z',
    ]);
  });
});
