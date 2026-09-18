// Число раздела «Занятия» (docs/PLAN.md §14 слой 3.5, CLAUDE.md «Продуктовая
// фича = число в своём разделе», ADR-0025) — сколько занятий прошло за
// RECORDING_SUMMARY_PERIOD_DAYS дней и у скольких из них есть запись. Не
// расширяет shared/src/lessons.ts (134 строки, файл-храповик CLAUDE.md
// «Храповики») — отдельный файл под своё DTO и форматтер.
import { pluralRu, type PluralForms } from './plural-ru';

export interface LessonRecordingSummaryDto {
  periodDays: number;
  lessonsPast: number;
  lessonsWithRecording: number;
}

/** За сколько последних дней считается число — рядом с типом, как
 * SUMMARY_PERIOD_DAYS в summary.ts. */
export const RECORDING_SUMMARY_PERIOD_DAYS = 30;

const DAY_FORMS: PluralForms = { one: 'день', few: 'дня', many: 'дней', other: 'дней' };
const LESSON_FORMS: PluralForms = {
  one: 'занятие',
  few: 'занятия',
  many: 'занятий',
  other: 'занятий',
};

function periodPhrase(periodDays: number): string {
  return `${periodDays} ${pluralRu(periodDays, DAY_FORMS)}`;
}

/**
 * Текст для «Занятий» (PlanningScreen.tsx) — сколько занятий прошло и у
 * скольких есть запись. Чистая база (`lessonsPast === 0`) — честное «пока
 * нечего показать» (VOICE.md), не «0 из 0» и не «NaN».
 */
export function formatRecordingSummary(summary: LessonRecordingSummaryDto): string {
  const { periodDays, lessonsPast, lessonsWithRecording } = summary;
  const period = periodPhrase(periodDays);
  if (lessonsPast === 0) {
    return `Пока нечего показать: за ${period} ни одного прошедшего занятия.`;
  }
  const lessonsPhrase = `${lessonsPast} ${pluralRu(lessonsPast, LESSON_FORMS)}`;
  if (lessonsWithRecording === 0) {
    return `За ${period} прошло ${lessonsPhrase}, ни у одного нет записи.`;
  }
  if (lessonsWithRecording === lessonsPast) {
    return `За ${period} прошло ${lessonsPhrase}, у всех есть запись.`;
  }
  return `За ${period} прошло ${lessonsPhrase}, у ${lessonsWithRecording} есть запись.`;
}
