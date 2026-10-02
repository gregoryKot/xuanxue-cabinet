// Текст подсказки в ленте «выберите свои занятия» (ADR-0162, п. 5) — чистая
// логика без React и сети: сколько раз в неделю школа напоминает человеку, пока
// он ничего не отмечал, и как это звучит. Число считает из расписания, которое
// экран уже получил: отдельного запроса за ним нет.
import {
  EVERY_WEEK,
  pluralRu,
  type LessonScopeClassDto,
  type PluralForms,
} from '@xuanxue/shared';

const TIMES_FORMS: PluralForms = { one: 'раз', few: 'раза', many: 'раз', other: 'раза' };

/** Сколько занятий в неделю в расписании школы: слот правила — одно занятие, а
 * слот «раз в две недели» — половина (ADR-0168), итог округляется до целого.
 * В режиме «все» (дефолт) столько напоминаний в неделю в среднем и приходит. */
export function weeklyLessonCount(classes: readonly LessonScopeClassDto[]): number {
  const perWeek = classes.reduce(
    (sum, item) =>
      sum +
      item.slots.reduce((slots, slot) => slots + 1 / (slot.everyWeeks ?? EVERY_WEEK), 0),
    0,
  );
  return Math.round(perWeek);
}

/** «Напоминаем обо всех занятиях школы — **16 раз в неделю**». Число — факт,
 * поэтому жирным (docs/VOICE.md «Акценты»). */
export function lessonScopeHintHeadline(weeklyCount: number): string {
  return `Напоминаем обо всех занятиях школы — **${weeklyCount} ${pluralRu(weeklyCount, TIMES_FORMS)} в неделю**`;
}
