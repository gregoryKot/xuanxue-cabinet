// Юнит-тесты чистой логики разворачивания правил в моменты — без Mongo
// (CLAUDE.md «Тесты»). DST Asia/Jerusalem обязателен; CI гоняет этот файл
// ещё под TZ=Australia/Sydney — даты в тестах только с `Z` или явной зоной.
import { DateTime, Settings } from 'luxon';
import { Types } from 'mongoose';
import type { ScheduleRule } from '@xuanxue/shared';
import { expectedOccurrences, planOccurrences } from './lesson-occurrences';

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

// «Раз в две недели» (ADR-0168): занятие для преподавателей — пятница 20:00,
// первое 2026-10-02. Окна берутся с запасом, счёт идёт от `startsOn`, а не от
// начала окна: тот же слот при другом `now` планировщика даёт те же даты.
const FRIDAY_20_EVERY_TWO_WEEKS: ScheduleRule = {
  weekday: 5,
  time: '20:00',
  durationMin: 90,
  everyWeeks: 2,
  startsOn: '2026-10-02',
};
const plannedDates = (occurrences: DateTime[]) =>
  occurrences.map((o) => o.setZone(TZ).toISODate());

describe('planOccurrences — раз в две недели', () => {
  it('пятницы через одну: 02.10, 16.10, 30.10 — 09.10 и 23.10 пропущены', () => {
    const occurrences = planOccurrences(
      FRIDAY_20_EVERY_TWO_WEEKS,
      TZ,
      iso('2026-10-01T00:00:00Z'),
      iso('2026-11-03T00:00:00Z'),
    );
    expect(plannedDates(occurrences)).toEqual(['2026-10-02', '2026-10-16', '2026-10-30']);
  });

  it('чередование не зависит от начала окна: окно с нечётной пятницы даёт те же даты', () => {
    const occurrences = planOccurrences(
      FRIDAY_20_EVERY_TWO_WEEKS,
      TZ,
      iso('2026-10-08T00:00:00Z'),
      iso('2026-11-03T00:00:00Z'),
    );
    expect(plannedDates(occurrences)).toEqual(['2026-10-16', '2026-10-30']);
  });

  it('startsOn в будущем: пятницы до первого занятия не порождают', () => {
    const occurrences = planOccurrences(
      FRIDAY_20_EVERY_TWO_WEEKS,
      TZ,
      iso('2026-09-01T00:00:00Z'),
      iso('2026-10-10T00:00:00Z'),
    );
    expect(plannedDates(occurrences)).toEqual(['2026-10-02']);
  });

  it('первое занятие — ровно день startsOn, не позже: пятница окна совпала с датой начала', () => {
    const occurrences = planOccurrences(
      FRIDAY_20_EVERY_TWO_WEEKS,
      TZ,
      iso('2026-10-02T00:00:00Z'),
      iso('2026-10-03T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-10-02T17:00:00.000Z',
    ]);
  });

  it('длинное окно через зимний переход: 25.10 часы переведены назад, чередование не сбилось', () => {
    // 2026-10-25 — в Израиле конец летнего времени. Пятницы: 02.10 (+03:00,
    // 17:00Z), 16.10 (+03:00), 30.10 (+02:00, 18:00Z), 13.11, 27.11, 11.12.
    const occurrences = planOccurrences(
      FRIDAY_20_EVERY_TWO_WEEKS,
      TZ,
      iso('2026-10-01T00:00:00Z'),
      iso('2026-12-15T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-10-02T17:00:00.000Z',
      '2026-10-16T17:00:00.000Z',
      '2026-10-30T18:00:00.000Z',
      '2026-11-13T18:00:00.000Z',
      '2026-11-27T18:00:00.000Z',
      '2026-12-11T18:00:00.000Z',
    ]);
  });

  it('весенний переход: пятницы через одну 06.03, 20.03, 03.04 — 20:00 по Израилю в 18:00Z, потом в 17:00Z', () => {
    // Весной 2026 в Израиле часы переводят вперёд в 02:00 пятницы 27.03 — по
    // двухнедельному счёту эта пятница лишняя. Занятия 20.03 (+02:00) и 03.04
    // (+03:00) по обе стороны перехода остаются в 20:00 по часам школы.
    const occurrences = planOccurrences(
      { ...FRIDAY_20_EVERY_TWO_WEEKS, startsOn: '2026-03-06' },
      TZ,
      iso('2026-03-01T00:00:00Z'),
      iso('2026-04-10T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-03-06T18:00:00.000Z',
      '2026-03-20T18:00:00.000Z',
      '2026-04-03T17:00:00.000Z',
    ]);
  });

  it('startsOn выпал на сам день перехода: пятница 27.03 с нулевой неделей — занятие в 20:00 летнего времени', () => {
    const occurrences = planOccurrences(
      { ...FRIDAY_20_EVERY_TWO_WEEKS, startsOn: '2026-03-27' },
      TZ,
      iso('2026-03-20T00:00:00Z'),
      iso('2026-04-12T00:00:00Z'),
    );
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-03-27T17:00:00.000Z',
      '2026-04-10T17:00:00.000Z',
    ]);
  });

  it('день считается в поясе слота, а не UTC: вечер 20:00 в Нью-Йорке — уже следующие сутки по UTC', () => {
    const occurrences = planOccurrences(
      { weekday: 5, time: '20:00', everyWeeks: 2, startsOn: '2026-10-02' },
      'America/New_York',
      iso('2026-10-01T00:00:00Z'),
      iso('2026-10-20T00:00:00Z'),
    );
    // Пятницы 02.10 и 16.10 по часам Нью-Йорка (UTC-4): 20:00 = 00:00Z субботы.
    expect(occurrences.map((o) => o.toUTC().toISO())).toEqual([
      '2026-10-03T00:00:00.000Z',
      '2026-10-17T00:00:00.000Z',
    ]);
  });

  it('не зависит от Settings.defaultZone процесса', () => {
    Settings.defaultZone = 'Australia/Sydney';
    try {
      const occurrences = planOccurrences(
        FRIDAY_20_EVERY_TWO_WEEKS,
        TZ,
        iso('2026-10-01T00:00:00Z'),
        iso('2026-11-03T00:00:00Z'),
      );
      expect(plannedDates(occurrences)).toEqual([
        '2026-10-02',
        '2026-10-16',
        '2026-10-30',
      ]);
    } finally {
      Settings.defaultZone = 'system';
    }
  });

  it('everyWeeks: 1 и правило без поля — каждая неделя, startsOn не мешает', () => {
    const window = [iso('2026-10-01T00:00:00Z'), iso('2026-10-24T00:00:00Z')] as const;
    const weekly = planOccurrences({ weekday: 5, time: '20:00' }, TZ, ...window);
    const explicitOne = planOccurrences(
      { weekday: 5, time: '20:00', everyWeeks: 1, startsOn: '2026-10-09' },
      TZ,
      ...window,
    );
    expect(plannedDates(weekly)).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
    ]);
    expect(plannedDates(explicitOne)).toEqual(plannedDates(weekly));
  });

  it('раз в две недели без startsOn или с датой не из календаря — занятий нет, а не еженедельные', () => {
    const window = [iso('2026-10-01T00:00:00Z'), iso('2026-10-24T00:00:00Z')] as const;
    const noStart = { weekday: 5 as const, time: '20:00', everyWeeks: 2 as const };
    expect(planOccurrences(noStart, TZ, ...window)).toEqual([]);
    expect(planOccurrences({ ...noStart, startsOn: 'мусор' }, TZ, ...window)).toEqual([]);
  });
});

describe('expectedOccurrences — раз в две недели', () => {
  it('рядом с еженедельным правилом того же класса чередуется только своё', () => {
    const weeklyId = new Types.ObjectId();
    const biweeklyId = new Types.ObjectId();
    const expected = expectedOccurrences(
      [
        { _id: weeklyId, weekday: 3, time: '19:00', durationMin: 60 },
        { _id: biweeklyId, ...FRIDAY_20_EVERY_TWO_WEEKS },
      ],
      TZ,
      iso('2026-10-01T00:00:00Z'),
      iso('2026-10-15T00:00:00Z'),
    );
    const byRule = (ruleId: Types.ObjectId) =>
      [...expected.values()]
        .filter((o) => o.ruleId.equals(ruleId))
        .map((o) => o.plannedAt.setZone(TZ).toISODate());
    expect(byRule(weeklyId)).toEqual(['2026-10-07', '2026-10-14']);
    expect(byRule(biweeklyId)).toEqual(['2026-10-02']);
  });
});
