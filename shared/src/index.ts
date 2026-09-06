// Общие типы и константы для api и web (CLAUDE.md, раздел «Структура и слои»:
// общий код — сразу в shared, а не копипастой между пакетами).

import type { Weekday } from './domain';

export type { ApiErrorBody, ApiErrorCode } from './api-error';
export type {
  Weekday,
  ChannelType,
  ClassFormat,
  LessonStatus,
  BroadcastKind,
  BroadcastStatus,
  DeliveryStatus,
  ScheduleRule,
  Recording,
} from './domain';
export {
  WEEKDAYS,
  CHANNEL_TYPES,
  CLASS_FORMATS,
  LESSON_STATUSES,
  BROADCAST_KINDS,
  BROADCAST_STATUSES,
  DELIVERY_STATUSES,
} from './domain';
export type { TemplatePlaceholder, TemplateValues } from './templates';
export {
  TEMPLATE_PLACEHOLDERS,
  renderTemplate,
  findUnknownPlaceholders,
} from './templates';
export type { TemplateKind } from './default-templates';
export { TEMPLATE_KINDS, DEFAULT_TEMPLATES } from './default-templates';
export { formatDurationRu } from './format-duration';
export type { UserRole, UserStatus, MeDto, TelegramLoginInput } from './auth';
export {
  USER_ROLES,
  USER_STATUSES,
  CSRF_HEADER,
  MUTATING_METHODS,
  isMutatingMethod,
} from './auth';

/** Часовой пояс школы — правило расписания хранится в нём (docs/PLAN.md §3). */
export const SCHOOL_TZ = 'Asia/Jerusalem';

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
