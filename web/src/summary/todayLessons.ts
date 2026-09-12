// Чистая логика «Сводки»: из окна занятий на 4 недели — только сегодняшние
// (CLAUDE.md «Тесты»: чистая логика — юнит без React). День календарный, в
// поясе зрителя: учитель открывает кабинет утром и спрашивает «что у меня
// сегодня», а не «что в ближайшие 28 дней».
import type { LessonDto } from '@xuanxue/shared';
import { dateKey } from '../lib/formatDate';

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»). */
export function pickTodayLessons(
  lessons: LessonDto[],
  now: Date = new Date(),
): LessonDto[] {
  const today = dateKey(now.toISOString());
  return lessons
    .filter((lesson) => dateKey(lesson.startsAt) === today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
