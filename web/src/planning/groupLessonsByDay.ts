// Чистая логика экрана «Планирование»: список дат занятий → группы по
// календарному дню в поясе браузера (CLAUDE.md «Тесты»: чистая логика — юнит
// без React). Сортировка по ISO-строке `startsAt` работает лексикографически,
// потому что формат фиксирован (UTC c `Z`, docs/PLAN.md §6).
import type { LessonDto } from '@xuanxue/shared';
import { dateKey, formatDayHeading } from '../lib/formatDate';

export interface LessonDayGroupData {
  key: string;
  heading: string;
  lessons: LessonDto[];
}

export function groupLessonsByDay(lessons: LessonDto[]): LessonDayGroupData[] {
  const sorted = [...lessons].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const groups = new Map<string, LessonDayGroupData>();

  for (const lesson of sorted) {
    const key = dateKey(lesson.startsAt);
    let group = groups.get(key);
    if (!group) {
      group = { key, heading: formatDayHeading(lesson.startsAt), lessons: [] };
      groups.set(key, group);
    }
    group.lessons.push(lesson);
  }

  return [...groups.values()];
}
