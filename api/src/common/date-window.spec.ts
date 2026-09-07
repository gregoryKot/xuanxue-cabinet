import { DateTime } from 'luxon';
import { InvalidInputError } from './errors';
import { assertWindow } from './date-window';

describe('assertWindow', () => {
  const FROM = DateTime.fromISO('2026-09-10T00:00:00Z', { zone: 'utc' });

  it('to позже from, окно в пределах лимита — не бросает', () => {
    expect(() => assertWindow(FROM, FROM.plus({ weeks: 1 }), 4, 'причина')).not.toThrow();
  });

  it('to раньше или равно from — InvalidInputError', () => {
    expect(() => assertWindow(FROM, FROM, 4, 'причина')).toThrow(InvalidInputError);
    expect(() => assertWindow(FROM, FROM.minus({ days: 1 }), 4, 'причина')).toThrow(
      'позже начала',
    );
  });

  it('окно шире лимита — InvalidInputError с числом недель и переданной причиной', () => {
    expect(() => assertWindow(FROM, FROM.plus({ weeks: 5 }), 4, 'сузьте окно')).toThrow(
      '4 недел',
    );
    expect(() => assertWindow(FROM, FROM.plus({ weeks: 5 }), 4, 'сузьте окно')).toThrow(
      'сузьте окно',
    );
  });

  it('окно ровно в лимит — не бросает', () => {
    expect(() => assertWindow(FROM, FROM.plus({ weeks: 4 }), 4, 'причина')).not.toThrow();
  });
});
