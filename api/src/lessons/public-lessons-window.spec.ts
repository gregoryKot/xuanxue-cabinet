// Юнит-тест выбора режима публичного расписания — без Mongo и DI (ADR-0170).
import { InvalidInputError } from '../common/errors';
import { resolvePublicLessonsWindow } from './public-lessons-window';

const FROM = '2026-10-05T00:00:00+03:00';

describe('resolvePublicLessonsWindow', () => {
  it('без параметров — «ближайшие», лимит по умолчанию 10', () => {
    expect(resolvePublicLessonsWindow({})).toEqual({ mode: 'count', limit: 10 });
  });

  it('с limit — «ближайшие» с этим лимитом', () => {
    expect(resolvePublicLessonsWindow({ limit: 3 })).toEqual({ mode: 'count', limit: 3 });
  });

  it('оба from/to — окно, границы нормализованы в UTC', () => {
    const sel = resolvePublicLessonsWindow({
      from: FROM,
      to: '2026-10-19T00:00:00+03:00',
    });
    if (sel.mode !== 'window') throw new Error('ожидалось окно');
    expect(sel.from.toISO()).toBe('2026-10-04T21:00:00.000Z');
    expect(sel.to.toISO()).toBe('2026-10-18T21:00:00.000Z');
  });

  it('одна граница без второй — InvalidInputError', () => {
    expect(() => resolvePublicLessonsWindow({ from: FROM })).toThrow(InvalidInputError);
    expect(() => resolvePublicLessonsWindow({ to: FROM })).toThrow(InvalidInputError);
  });

  it('limit вместе с окном — InvalidInputError', () => {
    expect(() =>
      resolvePublicLessonsWindow({
        limit: 5,
        from: FROM,
        to: '2026-10-06T00:00:00+03:00',
      }),
    ).toThrow('либо limit');
  });

  it('граница без смещения — InvalidInputError', () => {
    expect(() =>
      resolvePublicLessonsWindow({
        from: '2026-10-05T00:00:00',
        to: '2026-10-06T00:00:00Z',
      }),
    ).toThrow('со смещением');
  });

  it('to не позже from — InvalidInputError', () => {
    expect(() => resolvePublicLessonsWindow({ from: FROM, to: FROM })).toThrow(
      InvalidInputError,
    );
  });

  it('ровно 28 суток UTC — можно, на секунду больше — нельзя', () => {
    const from = '2026-10-05T00:00:00Z';
    expect(resolvePublicLessonsWindow({ from, to: '2026-11-02T00:00:00Z' }).mode).toBe(
      'window',
    );
    expect(() =>
      resolvePublicLessonsWindow({ from, to: '2026-11-02T00:00:01Z' }),
    ).toThrow(InvalidInputError);
  });

  it('смена смещения (337 часов) укладывается в окно', () => {
    const sel = resolvePublicLessonsWindow({
      from: '2024-10-20T00:00:00+03:00',
      to: '2024-11-03T00:00:00+02:00',
    });
    expect(sel.mode).toBe('window');
  });
});
