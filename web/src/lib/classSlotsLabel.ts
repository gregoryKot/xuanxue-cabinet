// «вс, ср · 08:00; пн · 19:00» — правила занятия расписания одной строкой.
// Время остаётся в поясе школы, без пересчёта на часы зрителя: правило
// повторяется каждую неделю, а не лежит на одной дате, и «Расписание» штата
// показывает его так же (schedule/timezoneLabel.ts, отзыв владельца
// 2026-09-12: пояс подписан один раз над списком, `ruleTzNote`). Пересчёт
// правила на чужие часы потребовал бы считать ближайшее повторение — это уже
// делает сервер (planOccurrences), второй счётчик в web разошёлся бы с ним.
import {
  classDisplayName,
  EVERY_TWO_WEEKS,
  EVERY_TWO_WEEKS_NOTE_RU,
  WEEKDAYS,
  WEEKDAY_LABELS_RU,
  type LessonScopeClassDto,
} from '@xuanxue/shared';

const GROUPS_SEPARATOR = '; ';
const DAYS_SEPARATOR = ', ';
const DAYS_TIME_SEPARATOR = ' · ';

/** Часть подписи: одно время и один ритм. «пт · 20:00» и «пт · 20:00 · раз в 2
 * недели» — две разные части, даже при общем дне и времени. */
interface SlotGroup {
  time: string;
  isBiweekly: boolean;
  days: Set<number>;
}

/** Дни с одним временем и одним ритмом склеиваются, группы идут по времени
 * (при равном — еженедельные раньше «раз в 2 недели», ADR-0168), дни внутри —
 * в порядке `WEEKDAYS` (неделя с воскресенья, как в сетке «Расписания»).
 * Занятие без правил даёт пустую строку — подписывать нечем. */
export function classSlotsLabel(slots: LessonScopeClassDto['slots']): string {
  const groups = new Map<string, SlotGroup>();
  for (const { weekday, time, everyWeeks } of slots) {
    const isBiweekly = everyWeeks === EVERY_TWO_WEEKS;
    const key = `${time}|${isBiweekly}`;
    const group = groups.get(key) ?? { time, isBiweekly, days: new Set<number>() };
    group.days.add(weekday);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        a.time.localeCompare(b.time) || Number(a.isBiweekly) - Number(b.isBiweekly),
    )
    .map(({ time, isBiweekly, days }) => {
      const labels = WEEKDAYS.filter((day) => days.has(day)).map((day) =>
        WEEKDAY_LABELS_RU[day].toLowerCase(),
      );
      const label = `${labels.join(DAYS_SEPARATOR)}${DAYS_TIME_SEPARATOR}${time}`;
      return isBiweekly
        ? `${label}${DAYS_TIME_SEPARATOR}${EVERY_TWO_WEEKS_NOTE_RU}`
        : label;
    })
    .join(GROUPS_SEPARATOR);
}

/** Пункт выбора занятия: название с группой и дни — в неделе школы есть
 * тёзки («Тайцзицюань · средняя группа» в Пн и Вт 10:00 и в Ср 18:30), и одно
 * название в списке не говорит, какое из них выбрано. */
export function classOptionLabel(cls: {
  title: string;
  groupLabel?: string;
  rules: LessonScopeClassDto['slots'];
}): string {
  const slots = classSlotsLabel(cls.rules);
  return slots ? `${classDisplayName(cls)} (${slots})` : classDisplayName(cls);
}

/** Название с группой по id занятия — для экранов, где материал знает только
 * `classIds` («Материалы», страница тега). */
export function classNamesById(
  classes: readonly { id: string; title: string; groupLabel?: string }[],
): Map<string, string> {
  return new Map(classes.map((cls) => [cls.id, classDisplayName(cls)]));
}
