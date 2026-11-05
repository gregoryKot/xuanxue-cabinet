// Тема недели (ADR-0197): чистая логика экрана «Занятия» и страницы «Тема
// недели». Своей записи у темы нет — это самая частая тема среди занятий
// недели, поэтому всё считается из списка занятий, без второго источника
// правды. Неделя — с воскресенья, в поясе зрителя (как planningWindow.ts).
import { pluralRu, type LessonDto } from '@xuanxue/shared';
import { dateKey, formatDayMonth } from '../lib/formatDate';
import type { LessonDayGroupData } from './groupLessonsByDay';

export interface LessonWeekGroupData {
  key: string;
  heading: string;
  days: LessonDayGroupData[];
  lessons: LessonDto[];
}

export interface WeekTopicDraft {
  topic: string;
  selectedIds: string[];
}

const LESSON_FORMS = {
  one: 'занятия',
  few: 'занятий',
  many: 'занятий',
  other: 'занятий',
} as const;
const NO_TOPIC_SUMMARY = 'Тема недели не задана';
// Полдень, а не полночь: «Неделя с …» не должна съезжать на соседний день
// из-за перехода времени на границе суток.
const NOON_HOUR = 12;

/** Воскресенье недели занятия, 00:00 по часам зрителя. */
function weekStartOf(iso: string): Date {
  const start = new Date(iso);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

/** Ключ недели — `dateKey` её воскресенья в поясе зрителя. */
export function weekKeyOf(iso: string): string {
  return dateKey(weekStartOf(iso).toISOString());
}

/** «Неделя с 8 ноября» — по ключу недели («YYYY-MM-DD»). Строка без пояса
 * читается как местное время — то же воскресенье зрителя, что в ключе. */
export function weekHeadingOfKey(weekKey: string): string {
  const noon = new Date(`${weekKey}T${NOON_HOUR}:00:00`);
  return `Неделя с ${formatDayMonth(noon.toISOString())}`;
}

export function groupDayGroupsByWeek(
  groups: LessonDayGroupData[],
): LessonWeekGroupData[] {
  const weeks = new Map<string, LessonWeekGroupData>();
  for (const day of groups) {
    const first = day.lessons[0];
    if (!first) continue;
    const key = weekKeyOf(first.startsAt);
    let week = weeks.get(key);
    if (!week) {
      week = { key, heading: weekHeadingOfKey(key), days: [], lessons: [] };
      weeks.set(key, week);
    }
    week.days.push(day);
    week.lessons.push(...day.lessons);
  }
  return [...weeks.values()];
}

function activeLessons(lessons: LessonDto[]): LessonDto[] {
  return lessons
    .filter((lesson) => lesson.status !== 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Самая частая непустая тема; при равенстве — та, что раньше по времени. */
function dominantTopic(active: LessonDto[]): string {
  const counts = new Map<string, number>();
  for (const { topic } of active) {
    if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [topic, count] of counts) {
    if (count > bestCount) {
      best = topic;
      bestCount = count;
    }
  }
  return best;
}

/** Текущая тема недели — самая частая непустая тема неотменённых занятий;
 * `''` — темы нет ни у кого. */
export function weekTopicOf(lessons: LessonDto[]): string {
  return dominantTopic(activeLessons(lessons));
}

/** Строка под заголовком недели; `null` — в неделе нет неотменённых занятий. */
export function weekTopicSummary(lessons: LessonDto[]): string | null {
  const active = activeLessons(lessons);
  if (active.length === 0) return null;
  const topic = weekTopicOf(active);
  if (!topic) return NO_TOPIC_SUMMARY;
  const count = active.filter((lesson) => lesson.topic === topic).length;
  return `Тема недели: **${topic}** · ${count} из ${active.length} ${pluralRu(active.length, LESSON_FORMS)}`;
}

/** Начальное состояние страницы «Тема недели». */
export function weekTopicDraft(lessons: LessonDto[]): WeekTopicDraft {
  const active = activeLessons(lessons);
  const topic = dominantTopic(active);
  const selected = active.filter((lesson) => lesson.topic === topic);
  return { topic, selectedIds: selected.map((lesson) => lesson.id) };
}
