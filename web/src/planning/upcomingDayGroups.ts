// Список «Занятий»: занятия окна, сгруппированные по дням, начиная с
// сегодняшнего. Дни раньше сегодняшнего на экран не попадают (отзыв владельца
// 2026-09-21 — в понедельник первой группой дня стояло воскресенье, а в
// субботу до ближайшего занятия пришлось бы листать шесть прошедших дней).
// Сегодняшний день остаётся целиком: занятие в 19:00 никуда не делось, даже
// если сейчас 20:00, и прошедшие строки уже помечены «прошло» (LessonCard.tsx).
//
// Отбор идёт здесь, а не сужением запроса: окно `GET /lessons` проверяет
// сервер (api/src/common/date-window.ts, `assertListWindow`) и не принимает
// окно у́же четырёх недель, поэтому `from` остаётся началом недели
// (planningWindow.ts). Обратная сторона — впереди остаётся от трёх недель с
// днём (суббота) до четырёх (воскресенье), поэтому пустой экран не обещает
// срок: «Пока ничего не запланировано» в PlanningScreen.tsx.
//
// День календарный, в поясе зрителя. Ключ группы и ключ «сегодня» строит один
// форматтер `dateKey` («YYYY-MM-DD», en-CA), поэтому сравнение — обычное
// строковое, без арифметики на миллисекундах (CLAUDE.md «Время»).
import type { LessonDto } from '@xuanxue/shared';
import { dateKey } from '../lib/formatDate';
import { groupLessonsByDay, type LessonDayGroupData } from './groupLessonsByDay';

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»). */
export function upcomingDayGroups(
  lessons: LessonDto[],
  now: Date = new Date(),
): LessonDayGroupData[] {
  const today = dateKey(now.toISOString());
  return groupLessonsByDay(lessons).filter((group) => group.key >= today);
}
