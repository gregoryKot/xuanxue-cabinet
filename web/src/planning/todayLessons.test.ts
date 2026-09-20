// Границы дня — по поясу зрителя, поэтому `now` передаётся явно, а моменты
// занятий строятся от него же: CI гоняет vitest под UTC и под
// TZ=Australia/Sydney, и «плюс семь часов» в одном из них уезжает на
// следующий день (CLAUDE.md «Детерминизм»).
import { describe, expect, it } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { pickTodayLessons } from './todayLessons';

const NOW = new Date('2026-09-08T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function makeLesson(id: string, startsAt: Date): LessonDto {
  return {
    id,
    classId: 'c1',
    startsAt: startsAt.toISOString(),
    durationMin: 60,
    topic: '',
    status: 'scheduled',
    tags: [],
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('pickTodayLessons', () => {
  it('из окна на 4 недели остаются только сегодняшние', () => {
    const lessons = [
      makeLesson('вчера', new Date(NOW.getTime() - DAY_MS)),
      makeLesson('сегодня', NOW),
      makeLesson('через неделю', new Date(NOW.getTime() + 7 * DAY_MS)),
    ];

    expect(pickTodayLessons(lessons, NOW).map((lesson) => lesson.id)).toEqual([
      'сегодня',
    ]);
  });

  it('два занятия сегодня — по времени начала, раньше первым', () => {
    const lessons = [
      makeLesson('позже', new Date(NOW.getTime() + 60 * 1000)),
      makeLesson('раньше', NOW),
    ];

    expect(pickTodayLessons(lessons, NOW).map((lesson) => lesson.id)).toEqual([
      'раньше',
      'позже',
    ]);
  });

  it('занятий сегодня нет — пустой список, а не ближайшее', () => {
    const lessons = [makeLesson('завтра', new Date(NOW.getTime() + DAY_MS))];

    expect(pickTodayLessons(lessons, NOW)).toEqual([]);
  });
});
