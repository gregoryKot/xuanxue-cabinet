// Домен школы (ADR-0010): перечисления, составные типы и константы для
// занятий, каналов, рассылок и доставок. Один файл на предметную область;
// index.ts — только реэкспорт, без собственных объявлений (CLAUDE.md, «Дубли
// и мёртвый код»).

/** День недели по Luxon/JS: 0 = воскресенье … 6 = суббота. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

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

// 'sending' — доставка захвачена раннером (findOneAndUpdate из pending),
// второй тик/инстанс не берёт её же (ADR-0004). Захват старше
// DELIVERY_STALE_LOCK_MIN минут считается брошенным (инстанс упал
// посреди отправки) и снова доступен для захвата. 'cancelled' — канал
// выключили или занятие отменили/удалили между планированием и отправкой:
// слать уже некому и незачем, это не сбой (docs/PLAN.md §6).
export const DELIVERY_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'manual',
  'cancelled',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Повтор доставки после ошибки — через 2, потом 10 минут (docs/PLAN.md §6
 * «Доставка»); после второй неудачи — уведомление учителю, не третья попытка. */
export const DELIVERY_RETRY_DELAYS_MIN = [2, 10] as const;

/** Захват `sending` старше этого — брошен (упавший инстанс), раннер второго
 * тика подбирает доставку заново, а не ждёт её вечно. */
export const DELIVERY_STALE_LOCK_MIN = 10;

/** Правило расписания в поясе класса (ADR-0003) — разворачивается в UTC. */
export interface ScheduleRule {
  weekday: Weekday;
  /** "HH:mm" в поясе класса, не UTC. */
  time: string;
  durationMin: number;
}

/** Часовой пояс школы — правило расписания хранится в нём (docs/PLAN.md §3). */
export const SCHOOL_TZ = 'Asia/Jerusalem';

/** Формат `ScheduleRule.time`: HH от 00 до 23, mm от 00 до 59 — 99:99 не
 * проходит. Общий источник для схемы Mongoose (`class.schema.ts`) и DTO
 * (`schedule-rule.dto.ts`): DTO не должен зависеть от схемы Mongoose
 * (CLAUDE.md, раздел «Структура и слои» — `api → shared`, не наоборот). */
export const RULE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** За сколько минут до занятия слать ссылку по умолчанию (`classes.leadMinutes`).
 * Тот же дефолт использует планировщик занятий для класса, документ которого
 * пропал из базы — свой `leadMinutes` спросить уже не у кого, а второй
 * литерал «30» рядом разойдётся при следующей правке. */
export const DEFAULT_LEAD_MINUTES = 30;

/** Дефолт `settings.previewMinutes` (за сколько минут до отправки бот шлёт
 * учителю предпросмотр с кнопками «Отменить»/«Изменить тему», docs/PLAN.md
 * §6 «Telegram-бот для учителя») — только для документа школы без поля
 * (старая база, до этой настройки). Само значение живёт в БД и на экране
 * «Шаблоны» (CLAUDE.md «Кабинет учителя: всё настраивается в интерфейсе»),
 * читают его `PreviewService`/`decideBroadcast`/`findDueLessons` из
 * `SettingsService.get()`, не эту константу — она не источник правды. */
export const DEFAULT_PREVIEW_MINUTES = 5;

/** Запись занятия: ссылка (Drive, облако Zoom) или файл в Telegram по file_id. */
export interface Recording {
  title: string;
  url?: string;
  telegramFileId?: string;
}

/** На сколько недель вперёд планировщик держит `lessons` заполненными
 * (docs/PLAN.md §6 «Планировщик»); тем же числом ограничено окно списка
 * `GET /lessons` — экран «Планирование» показывает весь горизонт целиком,
 * запрашивать больше незачем. */
export const PLANNING_HORIZON_WEEKS = 4;
