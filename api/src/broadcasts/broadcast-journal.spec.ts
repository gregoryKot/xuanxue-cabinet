import { DateTime } from 'luxon';
import { InvalidInputError } from '../common/errors';
import { assertJournalWindow, buildJournalFilter } from './broadcast-journal';

describe('assertJournalWindow', () => {
  const FROM = DateTime.fromISO('2026-09-10T00:00:00Z', { zone: 'utc' });

  it('to позже from, окно в пределах 8 недель — не бросает', () => {
    expect(() => assertJournalWindow(FROM, FROM.plus({ weeks: 1 }))).not.toThrow();
  });

  it('to раньше или равно from — InvalidInputError', () => {
    expect(() => assertJournalWindow(FROM, FROM)).toThrow(InvalidInputError);
    expect(() => assertJournalWindow(FROM, FROM.minus({ days: 1 }))).toThrow(
      'позже начала',
    );
  });

  it('окно шире 8 недель — InvalidInputError с числом недель', () => {
    expect(() => assertJournalWindow(FROM, FROM.plus({ weeks: 9 }))).toThrow('8 недел');
  });

  it('окно ровно 8 недель — не бросает', () => {
    expect(() => assertJournalWindow(FROM, FROM.plus({ weeks: 8 }))).not.toThrow();
  });
});

describe('buildJournalFilter', () => {
  const FROM = DateTime.fromISO('2026-09-10T00:00:00Z', { zone: 'utc' });
  const TO = FROM.plus({ weeks: 1 });

  it('без status/kind — только окно по scheduledAt', () => {
    expect(buildJournalFilter({}, FROM, TO)).toEqual({
      scheduledAt: { $gte: FROM.toJSDate(), $lt: TO.toJSDate() },
    });
  });

  it('status и kind заданы — оба в фильтре', () => {
    expect(buildJournalFilter({ status: 'sent', kind: 'manual' }, FROM, TO)).toEqual({
      scheduledAt: { $gte: FROM.toJSDate(), $lt: TO.toJSDate() },
      status: 'sent',
      kind: 'manual',
    });
  });
});
