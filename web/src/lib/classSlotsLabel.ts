// «вс, ср · 08:00; пн · 19:00» — правила занятия расписания одной строкой.
// Время остаётся в поясе школы, без пересчёта на часы зрителя: правило
// повторяется каждую неделю, а не лежит на одной дате, и «Расписание» штата
// показывает его так же (schedule/timezoneLabel.ts, отзыв владельца
// 2026-09-12: пояс подписан один раз над списком, `ruleTzNote`). Пересчёт
// правила на чужие часы потребовал бы считать ближайшее повторение — это уже
// делает сервер (planOccurrences), второй счётчик в web разошёлся бы с ним.
import { WEEKDAYS, WEEKDAY_LABELS_RU, type LessonScopeClassDto } from '@xuanxue/shared';

const GROUPS_SEPARATOR = '; ';
const DAYS_SEPARATOR = ', ';
const DAYS_TIME_SEPARATOR = ' · ';

/** Дни с одним временем склеиваются, группы идут по времени, дни внутри — в
 * порядке `WEEKDAYS` (неделя с воскресенья, как в сетке «Расписания»). Занятие
 * без правил даёт пустую строку — подписывать нечем. */
export function classSlotsLabel(slots: LessonScopeClassDto['slots']): string {
  const daysByTime = new Map<string, Set<number>>();
  for (const { weekday, time } of slots) {
    daysByTime.set(time, (daysByTime.get(time) ?? new Set<number>()).add(weekday));
  }
  return [...daysByTime.entries()]
    .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
    .map(([time, days]) => {
      const labels = WEEKDAYS.filter((day) => days.has(day)).map((day) =>
        WEEKDAY_LABELS_RU[day].toLowerCase(),
      );
      return `${labels.join(DAYS_SEPARATOR)}${DAYS_TIME_SEPARATOR}${time}`;
    })
    .join(GROUPS_SEPARATOR);
}
