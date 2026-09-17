// DTO и константы API банка вопросов экзамена (`/exam-items`, слой 4.2,
// docs/PLAN.md §11, docs/adr/0022-exam-model-item-bank-and-snapshot.md).
// Общий контракт api и web (CLAUDE.md, раздел «Слои»): DTO в api объявляется
// как `implements` этих типов, расхождение ловит tsc. Веб-экран — следующий
// слой, здесь только контракт бэкенда.

import type { ExamMediaDto } from './exam-media';
import type { RubricCriterionDto, RubricCriterionInput } from './exam-rubric';

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
  tagsMax: 10,
  tag: 40,
} as const;

export const EXAM_ITEM_NOT_FOUND_MESSAGE = 'Вопрос не найден. Обновите список.';

// Правило вариантов с картинками (ADR-0035): пустой вариант — ни текста, ни
// картинки — не сохраняется; проверяет сервис (assertOptionsForKind), форма
// повторяет проверку до отправки.
export const OPTION_TEXT_OR_IMAGE_MESSAGE =
  'У варианта ответа нужен текст или картинка. Впишите текст или добавьте картинку.';

// Форма экзамена, собранная из вопросов банка (`/exams`, слой 4.3,
// docs/PLAN.md §11, ADR-0022 + дополнение 2026-09-12). Форма ссылается на
// вопрос только по `itemId`, без номера версии — версию, которую видел
// сдающий, закрепляет попытка в момент старта (слой 4.4), не форма: иначе
// правка опечатки в вопросе не доехала бы ни до одного экзамена (дополнение
// к ADR-0022 внизу файла).

export const EXAM_STATUSES = ['draft', 'published', 'archived'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/** Блок — устройство хранилища: для учителя экзамен один список (ADR-0033). */
export interface ExamBlockDto {
  id: string;
  title: string; // «Теория», «Форма» — может быть пустым
  itemIds: string[]; // порядок вопросов — порядок массива
  shuffle: boolean; // перемешивать вопросы у каждого сдающего
}

/** `id` есть у существующего блока (сервис сохраняет его как есть — `mapBlocks`,
 * `exam-blocks.ts`); без `id` — новый блок, `id` создаёт сервис. Тот же приём, что
 * у `ExamItemOptionInput` выше и у `ScheduleRuleInput` (shared/src/classes.ts). */
export interface ExamBlockInput {
  id?: string;
  title?: string;
  itemIds: string[];
  shuffle?: boolean;
}

export interface ExamDto {
  id: string;
  title: string;
  description: string; // что это за экзамен — текст для ученика, может быть пустым
  level: string; // для какого уровня; пустая строка — для всех
  blocks: ExamBlockDto[];
  shuffleOptions: boolean; // перемешивать варианты ответа у сдающего (ADR-0033)
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
  shuffleOptions?: boolean;
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
  shuffleOptions?: boolean;
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

/** Вариант в снимке — как его видит ученик: без отметки «верный».
 * `imageId` — картинка варианта (ADR-0035): ученику она доступна по
 * `GET /exam-images/:id` ровно потому, что стоит в снимке его попытки. */
export interface AttemptOptionDto {
  id: string;
  text: string;
  imageId?: string;
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
  /** Только сотруднику школы (учитель, помощник, админ): в очереди проверки
   * нужно видеть, чью работу открываешь. Ученику не приходит — своя попытка
   * и так подписана экзаменом. */
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
  /** Видео экзамена (ADR-0023) — опционально ради текущих web-фикстур. */
  media?: ExamMediaDto[];
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

// Правило ТЗ 4.4, п.4/6/7: сохранить ответ или сдать можно только попытку в
// работе — свою и до дедлайна. Дедлайн — отдельное сообщение ниже, здесь про
// «уже сдана».
export const ATTEMPT_NOT_IN_PROGRESS_MESSAGE =
  'Эта попытка уже сдана. Открыть новую можно, если учитель разрешил ещё одну.';

// Правило ТЗ 4.4, п.7: время считает сервер — запрос после дедлайна получает
// отказ, а не тихое сохранение мимо часов, которых уже нет.
export const ATTEMPT_EXPIRED_MESSAGE =
  'Время экзамена вышло. Попытка закрыта, ответ не сохранён.';

// Правило ТЗ 4.4, п.5: ответ на вопрос не из снимка — не молчаливый мусор.
export const ATTEMPT_UNKNOWN_ITEM_MESSAGE =
  'Это вопрос не из вашей попытки. Обновите страницу и отвечайте на вопросы с экрана.';
