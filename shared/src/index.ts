// Общие типы и константы для api и web (CLAUDE.md, раздел «Структура и слои»:
// общий код — сразу в shared, а не копипастой между пакетами).

export type { ApiErrorBody, ApiErrorCode } from './api-error';

/** Часовой пояс школы — правило расписания хранится в нём (docs/PLAN.md §3). */
export const SCHOOL_TZ = 'Asia/Jerusalem';

/** День недели по Luxon/JS: 0 = воскресенье … 6 = суббота. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Короткие подписи дней недели, неделя начинается с воскресенья. */
export const WEEKDAY_LABELS_RU: Record<Weekday, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};
