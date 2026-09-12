// DTO и константы API банка вопросов экзамена (`/exam-items`, слой 4.2,
// docs/PLAN.md §11, docs/adr/0022-exam-model-item-bank-and-snapshot.md).
// Общий контракт api и web (CLAUDE.md, раздел «Слои»): DTO в api объявляется
// как `implements` этих типов, расхождение ловит tsc. Веб-экран — следующий
// слой, здесь только контракт бэкенда.

export const EXAM_ITEM_KINDS = ['text', 'single', 'multiple', 'video'] as const;
export type ExamItemKind = (typeof EXAM_ITEM_KINDS)[number];

export const EXAM_ITEM_STATUSES = ['draft', 'published', 'archived'] as const;
export type ExamItemStatus = (typeof EXAM_ITEM_STATUSES)[number];

export interface ExamItemOptionDto {
  id: string;
  text: string;
  correct: boolean;
}

/** `id` есть у существующего варианта (сервис сохраняет его как есть при
 * правке — см. `mapOptions`, `exam-item-options.ts`); без `id` — новый
 * вариант, сервис создаёт `id` сам. Тот же приём, что у `ScheduleRuleInput`
 * (shared/src/classes.ts) — с `id` или без него, правка сохраняет или
 * заводит идентификатор одинаково. */
export interface ExamItemOptionInput {
  id?: string;
  text: string;
  correct?: boolean;
}

/** Прошлая редакция опубликованного вопроса — правка содержательного поля
 * (prompt/hint/criteria/options) кладёт сюда снимок ДО правки, а `version`
 * поднимается на 1 (ADR-0022: сданные работы ссылаются на конкретную
 * редакцию, правка вопроса не должна менять смысл уже сданного). */
export interface ExamItemVersionDto {
  version: number;
  prompt: string;
  hint?: string;
  criteria?: string;
  options: ExamItemOptionDto[];
  replacedAt: string; // ISO UTC
}

export interface ExamItemDto {
  id: string;
  kind: ExamItemKind;
  prompt: string;
  hint?: string;
  criteria?: string;
  options: ExamItemOptionDto[];
  tags: string[];
  status: ExamItemStatus;
  version: number;
  history: ExamItemVersionDto[];
  authorId?: string;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

export interface CreateExamItemInput {
  kind: ExamItemKind;
  prompt: string;
  hint?: string;
  criteria?: string;
  options?: ExamItemOptionInput[];
  tags?: string[];
}

/**
 * PATCH: `kind` сюда не входит — смена типа вопроса значит завести новый
 * (правило CLAUDE.md/ТЗ 4.2, п.1). `null` — явный сброс, но только у полей из
 * NULLABLE_EXAM_ITEM_FIELDS ниже, как NULLABLE_CLASS_FIELDS у занятий.
 */
export interface UpdateExamItemInput {
  prompt?: string;
  hint?: string | null;
  criteria?: string | null;
  options?: ExamItemOptionInput[];
  tags?: string[];
  status?: ExamItemStatus;
}
export const NULLABLE_EXAM_ITEM_FIELDS = ['hint', 'criteria'] as const;

export interface ListExamItemsQuery {
  status?: ExamItemStatus;
  kind?: ExamItemKind;
  tag?: string;
  limit?: number;
}

export const EXAM_ITEM_LIMITS = {
  prompt: 2000,
  hint: 500,
  criteria: 1000,
  optionText: 300,
  optionsMax: 10,
  optionsMin: 2,
  tagsMax: 10,
  tag: 40,
} as const;

export const EXAM_ITEM_NOT_FOUND_MESSAGE = 'Вопрос не найден. Обновите список.';
