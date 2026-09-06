// DTO и константы API занятий (`/classes`, PR D). Общий контракт api и web
// (CLAUDE.md, раздел «Слои»): DTO в api объявляется как `implements` этих
// типов, расхождение ловит tsc.
import type { ClassFormat, ScheduleRule } from './domain';

/** Правило расписания в ответе API — с id субдокумента (сервис хранит его как
 * `_id`, планировщик ссылается на конкретное правило, не сравнивая поля). */
export interface ScheduleRuleDto extends ScheduleRule {
  id: string;
}

/** Правило расписания на входе: id есть у существующего правила (сервис
 * сохраняет его), без id — новое (сервис создаёт `_id` сам). */
export interface ScheduleRuleInput extends ScheduleRule {
  id?: string;
}

export interface ClassDto {
  id: string;
  title: string;
  groupLabel: string;
  format: ClassFormat;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  leaderId?: string;
  rules: ScheduleRuleDto[];
  tz: string;
  channelIds: string[];
  leadMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

export interface CreateClassInput {
  title: string;
  groupLabel?: string;
  format: ClassFormat;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  leaderId?: string;
  rules?: ScheduleRuleInput[];
  tz?: string;
  channelIds?: string[];
  leadMinutes?: number;
  active?: boolean;
}

/**
 * PATCH: поле, которого нет в теле, не трогается; `null` допустим только у
 * четырёх полей из NULLABLE_CLASS_FIELDS ниже — явный сброс (сервис
 * превращает его в `$unset`, не в сохранённый литерал `null`, см.
 * `classes.service.ts`/`splitUpdate`). У остальных полей `null` — ошибка
 * формы (400), а не «сбросить». Не `Partial<CreateClassInput>` — там `null`
 * не входит в тип полей, а здесь для четырёх из них это ровно то, что нужно
 * учителю интерфейса «очистить ссылку».
 */
export interface UpdateClassInput {
  title?: string;
  groupLabel?: string;
  format?: ClassFormat;
  location?: string | null;
  zoomLink?: string | null;
  zoomPassword?: string | null;
  leaderId?: string | null;
  rules?: ScheduleRuleInput[];
  tz?: string;
  channelIds?: string[];
  leadMinutes?: number;
  active?: boolean;
}

/** Единственные поля UpdateClassInput, где `null` — не ошибка формы, а явный
 * сброс. Источник правды для DTO (`@IsOptional()` вместо `OptionalNotNull()`)
 * и для `splitUpdate` — защита в глубину на случай, если DTO когда-то
 * разойдётся со списком (CLAUDE.md, раздел «API»). */
export const NULLABLE_CLASS_FIELDS = [
  'location',
  'zoomLink',
  'zoomPassword',
  'leaderId',
] as const;

export interface ListClassesQuery {
  active?: boolean;
  limit?: number;
}

export const CLASS_LIMITS = {
  title: 120,
  groupLabel: 60,
  location: 200,
  zoomLink: 500,
  zoomPassword: 64,
  rulesMax: 14,
  channelsMax: 20,
  leadMinutesMax: 1440,
  durationMinMin: 5,
  durationMinMax: 600,
} as const;

/** Общие для всех списковых DTO — «дай всё» запрещён (CLAUDE.md, раздел «API»). */
export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;
