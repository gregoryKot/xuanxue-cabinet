import { describe, expect, it } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { groupLessonsByDay } from './groupLessonsByDay';

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-07T16:00:00Z',
    durationMin: 60,
    topic: '',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupLessonsByDay', () => {
  it('пустой список — пустые группы', () => {
    expect(groupLessonsByDay([])).toEqual([]);
  });

  it('занятия одного дня попадают в одну группу, отсортированы по времени', () => {
    const groups = groupLessonsByDay([
      makeLesson({ id: 'b', startsAt: '2026-09-07T18:00:00Z' }),
      makeLesson({ id: 'a', startsAt: '2026-09-07T16:00:00Z' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.lessons.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('разные дни — разные группы, в хронологическом порядке', () => {
    const groups = groupLessonsByDay([
      makeLesson({ id: 'later', startsAt: '2026-09-10T16:00:00Z' }),
      makeLesson({ id: 'earlier', startsAt: '2026-09-07T16:00:00Z' }),
    ]);

    expect(groups.map((g) => g.lessons.map((l) => l.id))).toEqual([
      ['earlier'],
      ['later'],
    ]);
  });

  it('заголовок группы — день недели и число (формат formatDayHeading)', () => {
    const groups = groupLessonsByDay([makeLesson({ startsAt: '2026-09-07T16:00:00Z' })]);
    expect(groups[0]?.heading).toMatch(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб), \d+ \S+$/);
  });
});
