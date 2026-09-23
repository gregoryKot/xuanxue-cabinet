// Вопрос экзамена: DTO и константы API вопроса (`/exam-items`, слой 4.2).
// Отдельным файлом, потому что exams.ts упёрся в лимит размера (CLAUDE.md
// «Храповики») — не потому что так красивее: форма экзамена (блоки, лимиты
// формы) осталась в exams.ts, здесь только вопрос и его варианты ответа.

// DTO и константы API вопросов экзамена (`/exam-items`, слой 4.2,
// docs/PLAN.md §11, docs/adr/0022-exam-model-item-bank-and-snapshot.md).
// Общий контракт api и web (CLAUDE.md, раздел «Слои»): DTO в api объявляется
// как `implements` этих типов, расхождение ловит tsc. Веб-экран — следующий
// слой, здесь только контракт бэкенда.

import { TAG_LIMITS } from './tags';

export const EXAM_ITEM_KINDS = ['text', 'single', 'multiple', 'video'] as const;
export type ExamItemKind = (typeof EXAM_ITEM_KINDS)[number];

export const EXAM_ITEM_STATUSES = ['draft', 'published', 'archived'] as const;
export type ExamItemStatus = (typeof EXAM_ITEM_STATUSES)[number];

/** `imageId` — картинка варианта (ADR-0035, `GET /exam-images/:id`): вариант
 * может быть текстом, картинкой или тем и другим. `text` при картинке без
 * подписи — пустая строка, не отсутствие поля: форма и снимок попытки
 * всегда видят строку. */
export interface ExamItemOptionDto {
  id: string;
  text: string;
  correct: boolean;
  imageId?: string;
}

/** `id` есть у существующего варианта (сервис сохраняет его как есть при
 * правке — см. `mapOptions`, `exam-item-options.ts`); без `id` — новый
 * вариант, сервис создаёт `id` сам. Тот же приём, что у `ScheduleRuleInput`
 * (shared/src/classes.ts) — с `id` или без него, правка сохраняет или
 * заводит идентификатор одинаково. `text` необязателен: у варианта-картинки
 * подписи может не быть, но хотя бы одно из двух — текст или `imageId` —
 * сервис требует (OPTION_TEXT_OR_IMAGE_MESSAGE ниже). */
export interface ExamItemOptionInput {
  id?: string;
  text?: string;
  correct?: boolean;
  imageId?: string;
}

/** Прошлая редакция опубликованного вопроса — правка содержательного поля
 * (prompt/hint/criteria/options) кладёт сюда снимок ДО правки, а `version`
 * поднимается на 1 (ADR-0022: сданные работы ссылаются на конкретную
 * редакцию, правка вопроса не должна менять смысл уже сданного). */
interface ExamItemVersionDto {
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
  status?: ExamItemStatus; // не прислали — сразу `published` (ADR-0033)
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
  // Теги вопроса — та же рубрикация, что у материалов (ADR-0058): число
  // живёт в TAG_LIMITS (shared/src/tags.ts), здесь только ссылка, чтобы
  // лимит не разъехался по двум местам.
  tagsMax: TAG_LIMITS.perRecord,
  tag: TAG_LIMITS.length,
} as const;

export const EXAM_ITEM_NOT_FOUND_MESSAGE = 'Вопрос не найден. Обновите список.';

// Правило вариантов с картинками (ADR-0035): пустой вариант — ни текста, ни
// картинки — не сохраняется; проверяет сервис (assertOptionsForKind), форма
// повторяет проверку до отправки.
export const OPTION_TEXT_OR_IMAGE_MESSAGE =
  'У варианта ответа нужен текст или картинка. Впишите текст или добавьте картинку.';
