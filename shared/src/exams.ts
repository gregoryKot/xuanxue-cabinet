// DTO и константы API банка вопросов экзамена (`/exam-items`, слой 4.2,
// docs/PLAN.md §11, docs/adr/0022-exam-model-item-bank-and-snapshot.md).
// Общий контракт api и web (CLAUDE.md, раздел «Слои»): DTO в api объявляется
// как `implements` этих типов, расхождение ловит tsc. Веб-экран — следующий
// слой, здесь только контракт бэкенда.

import type { RubricCriterionDto, RubricCriterionInput } from './exam-rubric';

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

/** Прошлая редакция опубликованного вопроса: правка содержательного поля
 * кладёт сюда снимок до правки, `version` растёт на 1 (ADR-0022) — сданные
 * работы ссылаются на редакцию, правка не меняет смысл уже сданного. */
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

// Форма экзамена, собранная из вопросов банка (`/exams`, слой 4.3,
// docs/PLAN.md §11, ADR-0022 + дополнение 2026-09-12). Форма ссылается на
// вопрос только по `itemId`, без номера версии — версию, которую видел
// сдающий, закрепляет попытка в момент старта (слой 4.4), не форма: иначе
// правка опечатки в вопросе не доехала бы ни до одного экзамена (дополнение
// к ADR-0022 внизу файла).

export const EXAM_STATUSES = ['draft', 'published', 'archived'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/** Блок формы: вопросы одной темы, показываются вместе. */
export interface ExamBlockDto {
  id: string;
  title: string; // «Теория», «Форма» — может быть пустым
  itemIds: string[]; // порядок внутри блока — порядок массива
  shuffle: boolean; // перемешивать вопросы внутри блока у каждого сдающего
  required: boolean; // блок нельзя пропустить
}

/** `id` есть у существующего блока (правка сохраняет его как есть,
 * `mapBlocks`); без `id` — новый, сервис создаёт сам. Тот же приём, что у
 * `ExamItemOptionInput` выше и `ScheduleRuleInput` (shared/src/classes.ts). */
export interface ExamBlockInput {
  id?: string;
  title?: string;
  itemIds: string[];
  shuffle?: boolean;
  required?: boolean;
}

export interface ExamDto {
  id: string;
  title: string;
  description: string; // что это за экзамен — текст для ученика, может быть пустым
  level: string; // для какого уровня; пустая строка — для всех
  blocks: ExamBlockDto[];
  rubric: RubricCriterionDto[];
  timeLimitMin?: number; // нет — без ограничения
  attemptsAllowed: number; // по умолчанию 1 (PLAN §11: «по умолчанию попытка одна»)
  status: ExamStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

export interface CreateExamInput {
  title: string;
  description?: string;
  level?: string;
  blocks?: ExamBlockInput[];
  rubric?: RubricCriterionInput[]; // не прислали — сервис подставит DEFAULT_RUBRIC
  timeLimitMin?: number;
  attemptsAllowed?: number;
}

/**
 * PATCH: `null` — явный сброс, но только у полей из NULLABLE_EXAM_FIELDS
 * ниже, как NULLABLE_CLASS_FIELDS у занятий. `status` меняется отдельным
 * полем — переход в `published` сервис проверяет по правилам ТЗ 4.3, п.1–2
 * (форма непустая, все вопросы блоков опубликованы в банке).
 */
export interface UpdateExamInput {
  title?: string;
  description?: string | null;
  level?: string | null;
  blocks?: ExamBlockInput[];
  rubric?: RubricCriterionInput[]; // прислали — заменяет набор целиком, как blocks
  timeLimitMin?: number | null;
  attemptsAllowed?: number;
  status?: ExamStatus;
}
export const NULLABLE_EXAM_FIELDS = ['description', 'level', 'timeLimitMin'] as const;

export interface ListExamsQuery {
  status?: ExamStatus;
  level?: string;
  limit?: number;
}

export const EXAM_LIMITS = {
  title: 200,
  description: 2000,
  level: 60,
  blockTitle: 120,
  blocksMax: 20,
  itemsPerBlockMax: 50,
  timeLimitMinMax: 600,
  attemptsMax: 10,
  rubricCriterionTitle: 120,
  rubricCriterionDescription: 500,
  rubricMax: 10,
  rubricMaxScoreMax: 100,
} as const;

export const EXAM_NOT_FOUND_MESSAGE = 'Экзамен не найден. Обновите список.';

// Попытка сдачи экзамена (`/exams/:id/attempts`, `/attempts`, слой 4.4,
// docs/PLAN.md §11, ADR-0022 + дополнение 2026-09-12). В момент старта
// попытка сохраняет снимок формы — блоки, вопросы в редакции и порядке на
// момент старта — и дальше живёт им, не бланком. Снимок хранит и правильные
// ответы («correct» у вариантов), и критерии проверки: они понадобятся при
// проверке (слой 4.6), а взять их потом из банка нельзя — вопрос могли
// переписать. Но ученику они не уходят — DTO ниже устроены соответственно:
// `AttemptOptionDto`/`AttemptQuestionDto` не несут ни `correct`, ни
// `criteria`, в отличие от `ExamItemOptionDto`/`ExamItemDto` выше.

export const EXAM_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'graded'] as const;
export type ExamAttemptStatus = (typeof EXAM_ATTEMPT_STATUSES)[number];

/** Вариант в снимке — как его видит ученик: без отметки «верный». */
export interface AttemptOptionDto {
  id: string;
  text: string;
}

export interface AttemptQuestionDto {
  itemId: string;
  version: number;
  kind: ExamItemKind;
  prompt: string;
  hint?: string;
  options: AttemptOptionDto[];
}

export interface AttemptBlockDto {
  id: string;
  title: string;
  required: boolean;
  questions: AttemptQuestionDto[];
}

export interface AttemptAnswerDto {
  itemId: string;
  text?: string;
  optionIds?: string[];
}

export interface ExamAttemptDto {
  id: string;
  examId: string;
  examTitle: string;
  userId: string;
  /** Только сотруднику школы (учитель, помощник, админ) — ученику своя
   * попытка и так подписана, поле не приходит. */
  userName?: string;
  status: ExamAttemptStatus;
  blocks: AttemptBlockDto[];
  answers: AttemptAnswerDto[];
  startedAt: string; // ISO UTC с Z
  /** Есть, только если у формы стоит лимит времени. */
  deadlineAt?: string;
  submittedAt?: string;
  /** Сдано не человеком, а временем. */
  expired: boolean;
}

export interface SaveAttemptAnswersInput {
  answers: AttemptAnswerDto[];
}

export interface ListAttemptsQuery {
  examId?: string;
  status?: ExamAttemptStatus;
  limit?: number;
}

export const ATTEMPT_LIMITS = { answerText: 5000, optionsPerAnswer: 10 } as const;

export const ATTEMPT_NOT_FOUND_MESSAGE = 'Попытка не найдена. Обновите страницу.';

// Правило ТЗ 4.4, п.1: старт попытки на неопубликованной форме — отказ.
export const EXAM_NOT_PUBLISHED_MESSAGE =
  'Этот экзамен ещё не открыт для сдачи. Обратитесь к учителю.';

// Правило ТЗ 4.4, п.4/6/7: сохранить ответ или сдать можно только попытку
// в работе, до дедлайна — тот отдельным сообщением ниже, здесь «уже сдана».
export const ATTEMPT_NOT_IN_PROGRESS_MESSAGE =
  'Эта попытка уже сдана. Открыть новую можно, если учитель разрешил ещё одну.';

// Правило ТЗ 4.4, п.7: время считает сервер — запрос после дедлайна получает
// отказ, а не тихое сохранение мимо часов, которых уже нет.
export const ATTEMPT_EXPIRED_MESSAGE =
  'Время экзамена вышло. Попытка закрыта, ответ не сохранён.';

// Правило ТЗ 4.4, п.5: ответ на вопрос не из снимка — не молчаливый мусор.
export const ATTEMPT_UNKNOWN_ITEM_MESSAGE =
  'Это вопрос не из вашей попытки. Обновите страницу и отвечайте на вопросы с экрана.';
