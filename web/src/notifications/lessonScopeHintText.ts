// Текст подсказки в ленте «выберите свои занятия» (ADR-0162, п. 5) — чистая
// логика без React и сети: сколько раз в неделю школа напоминает человеку, пока
// он ничего не отмечал, и как это звучит. Число считает из расписания, которое
// экран уже получил: отдельного запроса за ним нет.
import { pluralRu, type LessonScopeClassDto, type PluralForms } from '@xuanxue/shared';

const TIMES_FORMS: PluralForms = { one: 'раз', few: 'раза', many: 'раз', other: 'раза' };

/** Сколько занятий в неделю в расписании школы: каждый слот правила — одно
 * занятие. В режиме «все» (дефолт) столько напоминаний и приходит. */
export function weeklyLessonCount(classes: readonly LessonScopeClassDto[]): number {
  return classes.reduce((sum, item) => sum + item.slots.length, 0);
}

/** «Напоминаем обо всех занятиях школы — **16 раз в неделю**». Число — факт,
 * поэтому жирным (docs/VOICE.md «Акценты»). */
export function lessonScopeHintHeadline(weeklyCount: number): string {
  return `Напоминаем обо всех занятиях школы — **${weeklyCount} ${pluralRu(weeklyCount, TIMES_FORMS)} в неделю**`;
}
