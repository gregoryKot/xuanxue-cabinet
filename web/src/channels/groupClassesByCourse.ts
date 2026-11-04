// Занятия одного курса — строкой, а не по слоту. Расписание школы хранится
// «одно занятие на время», поэтому «Тайцзицюань · Начинающие» там пять раз, и
// список из тридцати строк на странице канала не читался (отзыв владельца
// 2026-11-04: «это плохо, должно быть проще»). Курс = одинаковое
// `classDisplayName` (название + группы). Выключенные занятия посты не
// порождают — в список не попадают совсем.
import { WEEKDAY_LABELS_RU, classDisplayName, type ClassDto } from '@xuanxue/shared';

type CourseLinkState = 'all' | 'some' | 'none';

export interface CourseRow {
  /** Ключ строки — отображаемое имя курса. */
  key: string;
  name: string;
  classes: ClassDto[];
  state: CourseLinkState;
  /** «вс 20:00, пн 19:00» — дни в порядке недели школы: с воскресенья, как
   * нумерует `WEEKDAYS` и как их показывает «Расписание» (scheduleGrid.ts). */
  days: string;
}

function formatDays(classes: readonly ClassDto[]): string {
  const slots = classes
    .flatMap((cls) => cls.rules)
    .map((rule) => ({
      order: rule.weekday,
      time: rule.time,
      text: `${WEEKDAY_LABELS_RU[rule.weekday].toLowerCase()} ${rule.time}`,
    }))
    .sort((a, b) => a.order - b.order || a.time.localeCompare(b.time));
  return [...new Set(slots.map((slot) => slot.text))].join(', ');
}

function linkState(classes: readonly ClassDto[], channelId: string): CourseLinkState {
  const linked = classes.filter((cls) => cls.channelIds.includes(channelId)).length;
  if (linked === 0) return 'none';
  return linked === classes.length ? 'all' : 'some';
}

export function groupClassesByCourse(
  classes: readonly ClassDto[],
  channelId: string,
): CourseRow[] {
  const byName = new Map<string, ClassDto[]>();
  for (const cls of classes) {
    if (!cls.active) continue;
    const name = classDisplayName(cls);
    byName.set(name, [...(byName.get(name) ?? []), cls]);
  }
  return [...byName.entries()]
    .map(([name, group]) => ({
      key: name,
      name,
      classes: group,
      state: linkState(group, channelId),
      days: formatDays(group),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
