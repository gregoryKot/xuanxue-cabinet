// Форма экзамена: DTO и константы API формы (`/exams`, слой 4.3). Отдельным
// файлом от вопроса и попытки — тот же предел размера, что увёл my-exams.ts
// из этого файла (CLAUDE.md «Храповики», см. шапку my-exams.ts): вопрос живёт
// в exam-items.ts, попытка сдачи — в exam-attempts.ts, здесь только форма.

// Форма экзамена, собранная из вопросов (`/exams`, слой 4.3,
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
  /** Сколько вопросов из списка достаётся сдающему в одной попытке — случайная
   * выборка при старте (ADR-0082). Нет поля — все вопросы списка. Не больше
   * `itemIds.length`: сервис отказывает при сохранении. */
  questionsPerAttempt?: number;
  /** Обязательные вопросы — попадают каждому сдающему, остальное до
   * `questionsPerAttempt` добирается случайно (ADR-0082, дополнение). Подмножество
   * `itemIds`, не больше `questionsPerAttempt`; без выборки ни на что не влияет. */
  requiredItemIds?: string[];
}

/** `id` есть у существующего блока (сервис сохраняет его как есть — `mapBlocks`,
 * `exam-blocks.ts`); без `id` — новый блок, `id` создаёт сервис. Тот же приём, что
 * у `ExamItemOptionInput` (exam-items.ts) и `ScheduleRuleInput` (classes.ts). */
export interface ExamBlockInput {
  id?: string;
  title?: string;
  itemIds: string[];
  shuffle?: boolean;
  /** Нет поля — все вопросы списка (ADR-0082). */
  questionsPerAttempt?: number;
  requiredItemIds?: string[];
}

export interface ExamDto {
  id: string;
  title: string;
  description: string; // что это за экзамен — текст для ученика, может быть пустым
  level: string; // для какого уровня; пустая строка — для всех
  blocks: ExamBlockDto[];
  shuffleOptions: boolean; // перемешивать варианты ответа у сдающего (ADR-0033)
  timeLimitMin?: number; // нет — без ограничения
  /** Срок сдачи — «начать попытку можно до этого момента», ISO UTC с Z.
   * Второе, независимое от timeLimitMin ограничение (ADR-0124): лимит
   * времени — длина одной попытки, срок — до какого числа её вообще можно
   * начать. Нет поля — срока нет. Прошедший срок закрывает только НОВЫЕ
   * попытки (isExamDuePassed, exam-time.ts) — уже идущую он не трогает,
   * она доживает свой лимит минут как обычно (решение владельца 2026-09-22). */
  dueAt?: string;
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
  timeLimitMin?: number;
  dueAt?: string;
  attemptsAllowed?: number;
}

/**
 * PATCH: `null` — явный сброс, но только у полей из NULLABLE_EXAM_FIELDS
 * ниже, как NULLABLE_CLASS_FIELDS у занятий. `status` меняется отдельным
 * полем — переход в `published` сервис проверяет по правилам ТЗ 4.3, п.1–2
 * (форма непустая, все вопросы блоков опубликованы).
 */
export interface UpdateExamInput {
  title?: string;
  description?: string | null;
  level?: string | null;
  blocks?: ExamBlockInput[];
  shuffleOptions?: boolean;
  timeLimitMin?: number | null;
  dueAt?: string | null;
  attemptsAllowed?: number;
  status?: ExamStatus;
}
export const NULLABLE_EXAM_FIELDS = [
  'description',
  'level',
  'timeLimitMin',
  'dueAt',
] as const;

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
  // Первый настоящий экзамен школы — «Форма 1. Целостная собранность»,
  // 56 вопросов (ADR-0064): прежние 50 не выдержали первого же реального
  // случая. Для учителя экзамен — один список (ADR-0033), и форма на 56
  // вопросов упиралась бы в этот предел при любом сохранении с экрана.
  itemsPerBlockMax: 100,
  timeLimitMinMax: 600,
  attemptsMax: 10,
} as const;

export const EXAM_NOT_FOUND_MESSAGE = 'Экзамен не найден. Обновите список.';
// VOICE.md: что случилось и что сделать. Отказ ставится только на создании
// НОВОЙ попытки (ExamAttemptsService.start) — уже идущую срок не трогает
// (решение владельца 2026-09-22, ADR-0124).
export const EXAM_DUE_PASSED_MESSAGE =
  'Срок сдачи прошёл. Начать новую попытку нельзя — обратитесь к учителю.';

// Вопрос экзамена — DTO, лимиты и сообщения — живёт в exam-items.ts
// (`/exam-items`, слой 4.2). Попытка сдачи экзамена — статусы, DTO снимка,
// лимиты и сообщения об ошибках — живут в exam-attempts.ts
// (`/exams/:id/attempts`, `/attempts`, слой 4.4): тот же предел размера
// файла, что увёл my-exams.ts из этого файла (см. шапку my-exams.ts).
