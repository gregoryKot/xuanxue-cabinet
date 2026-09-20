// DTO и константы API дат занятий (`/lessons`). Общий контракт api и web
// (CLAUDE.md, раздел «Слои») — по образцу shared/src/classes.ts. Словарь
// продукта: «занятие» — класс/слот расписания (classes), «дата занятия» —
// конкретная встреча (lessons).
import type { BroadcastStatus, ClassFormat, LessonStatus, Recording } from './domain';

/** Запись в ответе API — с id субдокумента (лежит в массиве lessons.recordings). */
export interface RecordingDto extends Recording {
  id: string;
}

/** Статус ссылки на занятие для карточки «Планирования» (docs/PLAN.md §6
 * п.3) — только `lesson_link`, у рассылки записи свой цикл и своя карточка
 * (секция «Запись»), сюда не подмешивается. */
interface LessonBroadcastDto {
  status: BroadcastStatus;
  kind: 'lesson_link';
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
  /** Отсутствует, пока планировщик ещё не создал рассылку ссылки на это
   * занятие (окно до отправки шире, чем горизонт `/broadcasts`). */
  broadcast?: LessonBroadcastDto;
  /** Рубрика вечера («дракон», «начинающие»), а не постоянный признак курса —
   * для него есть название и `groupLabel` (ADR-0059, уточняет ADR-0058).
   * Лимиты и нормализация — общие с материалами (shared/src/tags.ts). */
  tags: string[];
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

export interface ListLessonsQuery {
  from: string;
  to: string;
  classId?: string;
  /** Точное совпадение тега — как у `ListMaterialsQuery.tag` (ADR-0059). */
  tag?: string;
  limit?: number;
}

/** Разовая дата занятия вне расписания — без `plannedAt`/`ruleId`, их
 * планировщик не создаёт и не трогает. */
export interface CreateLessonInput {
  classId: string;
  startsAt: string;
  durationMin?: number;
  topic?: string;
  tags?: string[];
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
  /** Не прислали — теги не трогаем; сброс — пустым массивом, не `null`. */
  tags?: string[];
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

// Экран ученика (`/me/lessons`, PLAN §11 слой 4.1) — ближайшие занятия всей
// школы, не только «своих»: у ученика пока нет групп, кем на какие занятия
// ходят — это этап 3 (см. комментарий в MyLessonsService). Поэтому здесь не
// LessonDto: ученику не нужны служебные поля планировщика (`ruleId`,
// `plannedAt`, статус рассылки-ссылки), а `zoomLink`/`zoomPassword` — уже
// готовая ссылка для занятия (override поверх ссылки класса), не два разных
// override-поля, которые ученику пришлось бы сводить самому.
export interface MyLessonDto {
  id: string;
  startsAt: string; // ISO UTC с Z
  durationMin: number;
  classTitle: string;
  groupLabel: string;
  format: ClassFormat;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  topic: string;
  status: LessonStatus;
  /** Тег видит и ученик — рубрика школы, не секрет, тот же довод, что у
   * `MyMaterialDto.tags`; фильтра по тегу тут нет (ADR-0059). */
  tags: string[];
}

export interface ListMyLessonsQuery {
  limit?: number;
}

/** Лимит списка «мои занятия» — своя пара, не LIST_LIMIT_DEFAULT/MAX
 * (shared/src/classes.ts): ученику короткий список на экран, не окно
 * планирования учителя (ТЗ docs/PLAN.md §11). */
export const MY_LESSONS_LIMIT_DEFAULT = 10;
export const MY_LESSONS_LIMIT_MAX = 50;
