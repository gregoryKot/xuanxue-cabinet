import { DateTime } from 'luxon';
import { InvalidInputError } from '../common/errors';
import { assertListWindow, parseUtcIso, resolveLessonsWindow } from './lesson-dates';

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

// ADR-0074: окно обязательно, если нет тега; одно поле окна без другого —
// ошибка независимо от тега. Одно место для правила — здесь, юнит-тест без
// Mongo (сервисный сценарий против настоящей базы — lessons.service.spec.ts).
describe('resolveLessonsWindow', () => {
  const FROM = '2026-09-01T00:00:00Z';
  const TO = '2026-09-08T00:00:00Z';

  it('окно есть, тега нет — как раньше, возвращает разобранные границы', () => {
    const window = resolveLessonsWindow(FROM, TO, undefined);
    expect(window?.from.toISO()).toBe('2026-09-01T00:00:00.000Z');
    expect(window?.to.toISO()).toBe('2026-09-08T00:00:00.000Z');
  });

  it('ни окна, ни тега — InvalidInputError (по-прежнему «дай всё» запрещено)', () => {
    expect(() => resolveLessonsWindow(undefined, undefined, undefined)).toThrow(
      InvalidInputError,
    );
    expect(() => resolveLessonsWindow(undefined, undefined, '')).toThrow(
      InvalidInputError,
    );
  });

  it('нет окна, есть тег — undefined (окно законно опущено, ADR-0074)', () => {
    expect(resolveLessonsWindow(undefined, undefined, 'дракон')).toBeUndefined();
  });

  it('from без to — ошибка и с тегом, и без', () => {
    expect(() => resolveLessonsWindow(FROM, undefined, undefined)).toThrow(
      InvalidInputError,
    );
    expect(() => resolveLessonsWindow(FROM, undefined, 'дракон')).toThrow(
      InvalidInputError,
    );
  });

  it('to без from — тоже ошибка', () => {
    expect(() => resolveLessonsWindow(undefined, TO, 'дракон')).toThrow(
      InvalidInputError,
    );
  });

  it('окно шире горизонта планировщика — та же ошибка, что у assertListWindow', () => {
    expect(() => resolveLessonsWindow(FROM, '2026-10-15T00:00:00Z', undefined)).toThrow(
      '4 недел',
    );
  });
});
