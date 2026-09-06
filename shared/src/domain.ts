// Домен школы (ADR-0010): перечисления и составные типы для занятий, каналов,
// рассылок и доставок. Один файл на предметную область; index.ts — реэкспорт
// и общие константы.

/** День недели по Luxon/JS: 0 = воскресенье … 6 = суббота. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const CHANNEL_TYPES = ['telegram', 'vk', 'manual', 'webpush'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CLASS_FORMATS = ['online', 'offline', 'both'] as const;
export type ClassFormat = (typeof CLASS_FORMATS)[number];

export const LESSON_STATUSES = ['scheduled', 'cancelled'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const BROADCAST_KINDS = ['lesson_link', 'recording', 'manual'] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];

export const BROADCAST_STATUSES = ['scheduled', 'sent', 'failed', 'cancelled'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'manual'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Правило расписания в поясе класса (ADR-0003) — разворачивается в UTC. */
export interface ScheduleRule {
  weekday: Weekday;
  /** "HH:mm" в поясе класса, не UTC. */
  time: string;
  durationMin: number;
}

/** Формат `ScheduleRule.time`: HH от 00 до 23, mm от 00 до 59 — 99:99 не
 * проходит. Общий источник для схемы Mongoose (`class.schema.ts`) и DTO
 * (`schedule-rule.dto.ts`): DTO не должен зависеть от схемы Mongoose
 * (CLAUDE.md, раздел «Структура и слои» — `api → shared`, не наоборот). */
export const RULE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Запись занятия: ссылка (Drive, облако Zoom) или файл в Telegram по file_id. */
export interface Recording {
  title: string;
  url?: string;
  telegramFileId?: string;
}
