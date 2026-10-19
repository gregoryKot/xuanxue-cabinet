// Снимок настроек напоминаний для синхронизации с приложением Daychi: тот же
// выбор, что человек делает в кабинете, читается и браузером, и приложением по
// одному маршруту (контракт Workshop reminder-sync). Отдельный файл, а не
// дописанный `lesson-notifications.ts`: тот описывает экран кабинета, а снимок —
// провод, форму которого держит внешний контракт.
import type { LessonScopeClassDto } from './lesson-notifications';

/** Версия формы снимка: клиент с неизвестной версией не разбирает поля. */
export const REMINDER_SYNC_VERSION = 1;

/** Значения «за сколько минут» в записи: `0` — напомнить в момент начала
 * занятия; `null` вместо числа — «как в школе». */
export const REMINDER_SYNC_LEAD_CHOICES = [0, 15, 30, 60, 120] as const;

/** Сколько разных ключей изменения укладывается в один запрос. */
export const REMINDER_SYNC_MAX_CHANGES = 64;

/** Потолок тела записи в байтах несжатого JSON (128 КиБ). */
export const REMINDER_SYNC_MAX_BODY_BYTES = 131072;

export type ReminderLeadMinutes = (typeof REMINDER_SYNC_LEAD_CHOICES)[number];

/** Одно изменение: выбрать или снять занятие расписания / отдельное занятие,
 * либо задать своё «за сколько минут» (`null` — «как в школе»). */
export type ReminderChange =
  | { kind: 'class' | 'lesson'; id: string; selected: boolean }
  | { kind: 'lead'; minutes: ReminderLeadMinutes | null };

/** Тело `PATCH /me/notifications/lessons/sync`. */
export interface ReminderSyncPatch {
  version: typeof REMINDER_SYNC_VERSION;
  changes: ReminderChange[];
}

export interface ReminderSyncSnapshot {
  version: typeof REMINDER_SYNC_VERSION;
  /** Аккаунт, чей это снимок, — всегда аутентифицированный. */
  accountId: string;
  /** Счётчик изменений десятичной строкой: `"0"`, пока выбор не менялся. */
  revision: string;
  /** id занятий расписания, без повторов, по возрастанию кодовых единиц. */
  classIds: string[];
  /** id отдельных занятий, без повторов, по возрастанию кодовых единиц. */
  lessonIds: string[];
  /** Своё «за сколько минут»; `null` — «как в школе». */
  leadMinutes: number | null;
  /** Школьное значение, которым подписан пункт «как в школе». */
  schoolMinutes: number;
  /** Активные занятия расписания по возрастанию `id`. */
  classes: LessonScopeClassDto[];
}
