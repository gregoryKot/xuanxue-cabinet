import { DateTime } from 'luxon';
import { buildLessonsFilter } from './lessons.queries';

const FROM = DateTime.fromISO('2026-09-01T00:00:00Z', { zone: 'utc' });
const TO = DateTime.fromISO('2026-09-30T00:00:00Z', { zone: 'utc' });
const WINDOW = { from: FROM.toISO() ?? '', to: TO.toISO() ?? '' };

describe('buildLessonsFilter', () => {
  it('окно дат — всегда, остальные поля не добавляются сами', () => {
    const filter = buildLessonsFilter(WINDOW, FROM, TO);
    expect(filter).toEqual({
      startsAt: { $gte: FROM.toJSDate(), $lt: TO.toJSDate() },
    });
  });

  it('classId сужает выборку', () => {
    const filter = buildLessonsFilter({ ...WINDOW, classId: 'c1' }, FROM, TO);
    expect(filter.classId).toBe('c1');
  });

  it('тег ищется точным совпадением (ADR-0070)', () => {
    const filter = buildLessonsFilter({ ...WINDOW, tag: 'дракон' }, FROM, TO);
    expect(filter.tags).toBe('дракон');
  });

  // Пустая строка приходит от пустого поля фильтра на экране: это «фильтр не
  // задан», а не «тег — пустая строка», иначе список молча оказался бы пустым.
  it('пустая строка тега фильтром не становится', () => {
    const filter = buildLessonsFilter({ ...WINDOW, tag: '' }, FROM, TO);
    expect(filter).not.toHaveProperty('tags');
  });
});
