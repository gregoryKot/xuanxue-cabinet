// DTO и константы API дат занятий (`/lessons`). Общий контракт api и web
// (CLAUDE.md, раздел «Слои») — по образцу shared/src/classes.ts. Словарь
// продукта: «занятие» — класс/слот расписания (classes), «дата занятия» —
// конкретная встреча (lessons).
import type { LessonStatus, Recording } from './domain';

/** Запись в ответе API — с id субдокумента (лежит в массиве lessons.recordings). */
export interface RecordingDto extends Recording {
  id: string;
}

export interface LessonDto {
  id: string;
  classId: string;
  /** Есть только у даты занятия, созданной планировщиком из расписания —
   * identity слота (см. lesson.schema.ts); у разового занятия отсутствует. */
  plannedAt?: string;
  startsAt: string;
  durationMin: number;
  topic: string;
  status: LessonStatus;
  leaderId?: string;
  ruleId?: string;
  zoomLinkOverride?: string;
  zoomPasswordOverride?: string;
  recordings: RecordingDto[];
  note?: string;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

export interface ListLessonsQuery {
  from: string;
  to: string;
  classId?: string;
  limit?: number;
}

/** Разовая дата занятия вне расписания — без `plannedAt`/`ruleId`, их
 * планировщик не создаёт и не трогает. */
export interface CreateLessonInput {
  classId: string;
  startsAt: string;
  durationMin?: number;
  topic?: string;
}

/**
 * PATCH: поле, которого нет в теле, не трогается; `null` допустим только у
 * четырёх полей из NULLABLE_LESSON_FIELDS ниже — явный сброс (сервис
 * превращает его в `$unset`, см. `splitUpdate` в `api/src/common/patch-update.ts`).
 * У остальных полей `null` — ошибка формы (400).
 */
export interface UpdateLessonInput {
  topic?: string;
  startsAt?: string;
  durationMin?: number;
  status?: LessonStatus;
  leaderId?: string | null;
  zoomLinkOverride?: string | null;
  zoomPasswordOverride?: string | null;
  note?: string | null;
}

/** Единственные поля UpdateLessonInput, где `null` — не ошибка формы, а явный
 * сброс. Источник правды для DTO (`@IsOptional()` вместо `OptionalNotNull()`)
 * и для `splitUpdate` — защита в глубину на случай, если DTO разойдётся со
 * списком (CLAUDE.md, раздел «API»). */
export const NULLABLE_LESSON_FIELDS = [
  'leaderId',
  'zoomLinkOverride',
  'zoomPasswordOverride',
  'note',
] as const;

export interface AddRecordingInput {
  title?: string;
  url?: string;
  telegramFileId?: string;
}

export const LESSON_LIMITS = {
  topic: 200,
  note: 2000,
  recordingTitle: 120,
  url: 500,
  telegramFileId: 200,
} as const;

/** Длительность разового занятия, если у класса нет ни одного правила
 * расписания, откуда её взять по умолчанию. */
export const LESSON_DEFAULT_DURATION_MIN = 60;
