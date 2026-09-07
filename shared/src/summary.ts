// DTO и константы API сводки школы (`/summary`, docs/PLAN.md §6): числа для
// админа/учителя (CLAUDE.md «Продуктовая фича = число в „Сводке“»).
export interface SummaryPeriod {
  from: string;
  to: string;
}

export interface NextLessonSummary {
  lessonId: string;
  title: string;
  startsAt: string;
}

export interface SummaryDto {
  period: SummaryPeriod;
  broadcastsSent: number;
  deliveriesFailed: number;
  deliveriesPending: number;
  manualWaiting: number;
  nextLesson?: NextLessonSummary;
  /** Чистая база — ни рассылок, ни ближайшего занятия: честное «пока нечего
   * показать» вместо нулей и «NaN» (VOICE.md). */
  emptyMessage?: string;
}

/** За сколько последних дней считаются числа сводки. */
export const SUMMARY_PERIOD_DAYS = 30;
