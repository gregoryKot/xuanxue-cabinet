// Рубрика проверки и итог по ней (слой 4.6, ADR-0022) — отдельным файлом,
// потому что exams.ts упёрся в лимит размера (CLAUDE.md «Храповики»). Здесь
// только то, что не зависит ни от формы, ни от попытки: exams.ts берёт
// отсюда критерии для `ExamDto.rubric`, exam-grading.ts — для снимка оценки.
// Обратной зависимости нет, значит нет и цикла (гейт `import-x/no-cycle`).

// Рубрика проверки (`/exams/:id`, слой 4.6, PLAN §11, ADR-0022) — критерий,
// по которому учитель ставит баллы за попытку. Правится вместе с экзаменом
// (PATCH /exams/:id) и заменяется целиком, тем же приёмом, что `blocks` выше:
// «Кабинет учителя: всё настраивается в интерфейсе» (CLAUDE.md) — рубрика
// живёт в базе, не в коде. Правка рубрики не трогает уже выставленные оценки:
// оценка хранит свой снимок критериев (`GradingCriterionDto` ниже), не ссылку
// на этот.
export interface RubricCriterionDto {
  id: string;
  title: string; // «Устойчивость и центр» — коротко, целиком видно на экране
  description?: string; // что именно смотреть — учителю, при проверке
  maxScore: number;
}

/** `id` есть у существующего критерия — сохраняется как есть при правке
 * (`mapRubric`, exam-rubric.ts); без `id` — новый, сервис создаёт `id` сам.
 * Тот же приём, что у `ExamBlockInput`/`ExamItemOptionInput` выше. */
export interface RubricCriterionInput {
  id?: string;
  title: string;
  description?: string;
  maxScore: number;
}

// Новый экзамен приезжает с этим набором (ТЗ 4.6, п.1) — учитель переписывает
// его под себя на экране, не дожидаясь разработчика; это стартовое
// содержимое, не константа поведения. Простыми словами, по-русски, «вы»
// не при делах — критерий обращён к учителю, не к ученику (docs/VOICE.md).
export const DEFAULT_RUBRIC: readonly RubricCriterionInput[] = [
  {
    title: 'Последовательность движений',
    description: 'Элементы формы идут по порядку, без пропусков и лишних вставок.',
    maxScore: 5,
  },
  {
    title: 'Устойчивость и центр',
    description: 'Вес переносится плавно, нет заваливаний и потери баланса.',
    maxScore: 5,
  },
  {
    title: 'Плавность и дыхание',
    description: 'Движение идёт одним потоком, дыхание не сбивается и не задерживается.',
    maxScore: 5,
  },
  {
    title: 'Соответствие темпу',
    description: 'Скорость ровная от начала до конца, без рывков и остановок.',
    maxScore: 5,
  },
] as const;

// Итог проверки по рубрике (слой 4.6, `exam_gradings`, ADR-0022) — сама
// оценка и карточка проверки учителя устроены в exam-grading.ts (CLAUDE.md
// «Храповики»: файл-лимит размера); здесь только то, что нужно
// `MyExamAttemptSummaryDto` ниже, — их же читает `exam-grading.ts` обратно.
export const GRADING_OUTCOMES = ['passed', 'failed', 'needs_work'] as const;
export type GradingOutcome = (typeof GRADING_OUTCOMES)[number];

/** Критерий в снимке оценки — рубрика на момент проверки плюс баллы. Тот же
 * набор полей ученику можно показать как есть (`MyExamAttemptSummaryDto`
 * ниже): это разбор его собственной работы, не критерии вопроса. */
export interface GradingCriterionDto {
  id: string;
  title: string;
  maxScore: number;
  score: number;
  comment?: string;
}
