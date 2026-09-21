import { describe, expect, it } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { upcomingDayGroups } from './upcomingDayGroups';

// Пояс зрителя задан явно: CI гоняет vitest ещё и под TZ=Australia/Sydney,
// где те же моменты попадают на другой календарный день.
stubViewerTimeZone();

// Вторник, 12:00 по Москве (пояс зрителя из stubViewerTimeZone).
const NOW = new Date('2026-09-22T09:00:00.000Z');

/** Идентификаторы занятий, которые остались на экране, по дням подряд. */
function idsLeftAfterPick(lessons: LessonDto[]): string[] {
  return upcomingDayGroups(lessons, NOW).flatMap((group) =>
    group.lessons.map((lesson) => lesson.id),
  );
}

describe('upcomingDayGroups', () => {
  it('пустой список — пусто', () => {
    expect(upcomingDayGroups([], NOW)).toEqual([]);
  });

  it('вчерашний день отброшен, сегодняшний и завтрашний остались', () => {
    const left = idsLeftAfterPick([
      makeLesson({ id: 'вчера', startsAt: '2026-09-21T16:00:00.000Z' }),
      makeLesson({ id: 'сегодня', startsAt: '2026-09-22T16:00:00.000Z' }),
      makeLesson({ id: 'завтра', startsAt: '2026-09-23T16:00:00.000Z' }),
    ]);

    expect(left).toEqual(['сегодня', 'завтра']);
  });

  it('занятие сегодня, но уже прошедшее, остаётся (решение владельца)', () => {
    // NOW — полдень по Москве, занятие было в 08:00 того же дня.
    const left = idsLeftAfterPick([
      makeLesson({ id: 'утро', startsAt: '2026-09-22T05:00:00.000Z' }),
    ]);

    expect(left).toEqual(['утро']);
  });

  it('все дни окна уже прошли — пусто, экран показывает объяснение', () => {
    const left = idsLeftAfterPick([
      makeLesson({ id: 'l1', startsAt: '2026-09-20T16:00:00.000Z' }),
      makeLesson({ id: 'l2', startsAt: '2026-09-21T16:00:00.000Z' }),
    ]);

    expect(left).toEqual([]);
  });

  it('оставшиеся дни идут по порядку', () => {
    const groups = upcomingDayGroups(
      [
        makeLesson({ id: 'позже', startsAt: '2026-09-24T16:00:00.000Z' }),
        makeLesson({ id: 'вчера', startsAt: '2026-09-21T16:00:00.000Z' }),
        makeLesson({ id: 'раньше', startsAt: '2026-09-23T16:00:00.000Z' }),
      ],
      NOW,
    );

    expect(groups.map((group) => group.key)).toEqual(['2026-09-23', '2026-09-24']);
  });
});
