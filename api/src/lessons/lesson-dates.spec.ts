import { DateTime } from 'luxon';
import { InvalidInputError } from '../common/errors';
import { assertListWindow, parseUtcIso } from './lesson-dates';

describe('parseUtcIso', () => {
  it('валидный ISO 8601 с Z — DateTime в UTC', () => {
    const dt = parseUtcIso('2026-09-10T16:00:00Z', 'startsAt');
    expect(dt.toISO()).toBe('2026-09-10T16:00:00.000Z');
    expect(dt.zoneName).toBe('UTC');
  });

  it('мусорная строка — InvalidInputError с именем поля', () => {
    expect(() => parseUtcIso('не дата', 'startsAt')).toThrow(InvalidInputError);
    expect(() => parseUtcIso('не дата', 'startsAt')).toThrow('startsAt');
  });

  it('дата в формате ДД.ММ.ГГГГ — InvalidInputError (не ISO 8601)', () => {
    expect(() => parseUtcIso('10.09.2026', 'from')).toThrow(InvalidInputError);
  });

  it('без смещения — InvalidInputError (не молча в UTC)', () => {
    expect(() => parseUtcIso('2026-09-10T19:00:00', 'startsAt')).toThrow('со смещением');
  });

  it('только дата, без времени и смещения — InvalidInputError', () => {
    expect(() => parseUtcIso('2026-09-10', 'startsAt')).toThrow('со смещением');
  });

  it('со смещением +03:00 — переводится в UTC', () => {
    const dt = parseUtcIso('2026-09-10T19:00:00+03:00', 'startsAt');
    expect(dt.toISO()).toBe('2026-09-10T16:00:00.000Z');
  });
});

describe('assertListWindow', () => {
  const FROM = DateTime.fromISO('2026-09-10T00:00:00Z', { zone: 'utc' });

  it('to позже from, окно в горизонте — не бросает', () => {
    expect(() => assertListWindow(FROM, FROM.plus({ weeks: 1 }))).not.toThrow();
  });

  it('to раньше or равно from — InvalidInputError', () => {
    expect(() => assertListWindow(FROM, FROM)).toThrow(InvalidInputError);
    expect(() => assertListWindow(FROM, FROM.minus({ days: 1 }))).toThrow('позже начала');
  });

  it('окно шире горизонта планировщика (5 недель) — InvalidInputError с числом недель', () => {
    expect(() => assertListWindow(FROM, FROM.plus({ weeks: 5 }))).toThrow('4 недел');
  });

  it('окно ровно в горизонт (4 недели) — не бросает', () => {
    expect(() => assertListWindow(FROM, FROM.plus({ weeks: 4 }))).not.toThrow();
  });
});
