// Проверка попытки по рубрике (слой 4.6, PLAN §11, ADR-0022) — карточка
// проверки учителя и оценка. Отдельный файл от exams.ts (CLAUDE.md
// «Храповики»: файл-лимит размера) — своя, достаточно большая подсистема
// поверх типов формы/попытки, а не продолжение самого экзамена.
import type { ExamMediaDto } from './exam-media';
import type { ExamAttemptStatus, ExamItemKind } from './exams';
import type {
  GradingCriterionDto,
  GradingOutcome,
  RubricCriterionDto,
} from './exam-rubric';

// Карточка проверки учителя (`GET /attempts/:id/review`) — ответы ученика
// рядом с критериями проверки вопроса, и правильность выбранных вариантов
// там, где вопрос честно проверяется автоматом (выбор варианта). Маршрут
// закрыт ученику (роль, не владение — проверяющий видит чужую работу по
// сути своей роли).

/** Вариант в карточке проверки — в отличие от `AttemptOptionDto` несёт
 * `correct` (учитель должен видеть, какой вариант верный, чтобы оценить
 * ответ) и `selected` (что из этого выбрал ученик). Не уходит ученику —
 * `/review` закрыт ролью `student` на уровне контроллера. */
export interface AttemptReviewOptionDto {
  id: string;
  text: string;
  correct: boolean;
  selected: boolean;
}

/** Автопроверка вариантов (ТЗ 4.6, п.3: честна только там, где сдающий
 * выбирает готовый вариант) — сколько верных выбрал из скольких верных
 * всего у вопроса, и сколько лишних (неверных) выбрал вместе с ними.
 * Отсутствует у вопроса без вариантов (текст, видео) — считать нечего. */
export interface AttemptOptionCheckDto {
  correctSelectedCount: number;
  correctTotalCount: number;
  incorrectSelectedCount: number;
}

export interface AttemptReviewQuestionDto {
  itemId: string;
  kind: ExamItemKind;
  prompt: string;
  hint?: string;
  /** Критерии проверки вопроса — только для учителя (ТЗ 4.6, п.3); ученику
   * их не видно ни на одном маршруте (см. `AttemptQuestionDto`, exams.ts). */
  criteria?: string;
  answerText?: string;
  /** Пусто у вопроса без вариантов (текст, видео). */
  options: AttemptReviewOptionDto[];
  optionsCheck?: AttemptOptionCheckDto;
}

export interface AttemptReviewBlockDto {
  id: string;
  title: string;
  questions: AttemptReviewQuestionDto[];
}

export interface AttemptReviewDto {
  attemptId: string;
  examId: string;
  examTitle: string;
  userId: string;
  /** Маршрут и так только для учителя (роль на контроллере) — имя приходит
   * всегда, не опционально, как в `ExamAttemptDto` (exams.ts). Аккаунт
   * удалён — `DELETED_USER_NAME`, не пустая строка. */
  userName: string;
  status: ExamAttemptStatus;
  blocks: AttemptReviewBlockDto[];
  /** Текущая рубрика экзамена — по ней ставится новая оценка. Уже
   * выставленная оценка (`grading` ниже) хранит свой снимок и не меняется
   * следом за правкой этой рубрики (ТЗ 4.6, п.1). */
  rubric: RubricCriterionDto[];
  /** Есть, только если оценка уже выставлена. */
  grading?: ExamGradingDto;
  /** Видео экзамена (слой 4.5, ADR-0023) — учитель видит в карточке проверки.
   * Опционально в типе по той же причине, что у `ExamAttemptDto.media`
   * (exams.ts): существующие фикстуры web/ не тронуты правкой контракта. */
  media?: ExamMediaDto[];
}

// Оценка попытки по рубрике (`exam_gradings`, `PUT /attempts/:id/grading`) —
// данные ученика: `userId` — чьи это баллы, не того, кто проверял
// (`graderId`). `criteria` — снимок критериев рубрики на момент проверки со
// своими баллами: правка рубрики экзамена после этого не меняет уже
// выставленную оценку, тот же принцип, что снимок формы в попытке (см.
// комментарий у `ExamAttemptDto`, exams.ts). `GradingOutcome`/
// `GradingCriterionDto` — в exams.ts (нужны и `MyExamAttemptSummaryDto` там же).

/** Вход `PUT /attempts/:id/grading` — баллы и комментарий по критерию
 * рубрики; `title`/`maxScore` сервис берёт из текущей рубрики экзамена по
 * этому `id` (ТЗ 4.6, п.2), не из запроса — иначе учитель мог бы задним
 * числом переписать шкалу прямо в оценке. */
export interface GradingCriterionInput {
  id: string;
  score: number;
  comment?: string;
}

export interface PutGradingInput {
  criteria: GradingCriterionInput[];
  comment?: string;
  outcome: GradingOutcome;
}

export interface ExamGradingDto {
  id: string;
  attemptId: string;
  examId: string;
  userId: string;
  graderId: string;
  criteria: GradingCriterionDto[];
  comment?: string;
  outcome: GradingOutcome;
  gradedAt: string; // ISO UTC с Z
}

export const GRADING_LIMITS = { comment: 2000, criterionComment: 1000 } as const;

// `userName` в `ExamAttemptDto` и `AttemptReviewDto` — человека могли уже
// удалить (аудит В11, `UserDeletionService.deleteAllUserData`); честная
// заглушка вместо пустой строки, одна на оба маршрута.
export const DELETED_USER_NAME = 'Аккаунт удалён';

// Правило ТЗ 4.6, п.2: проверить можно только сданную (или уже проверенную —
// повторный PUT переписывает оценку) работу, не черновик в работе.
export const ATTEMPT_NOT_SUBMITTED_MESSAGE =
  'Эту работу ещё нельзя проверить: ученик её не сдал. Дождитесь сдачи.';

/** Критерий из тела запроса, которого нет в текущей рубрике экзамена —
 * рубрику успели переписать, пока учитель заполнял баллы. */
export function unknownCriterionMessage(criterionId: string): string {
  return `Критерий рубрики «${criterionId}» не найден — рубрику могли изменить. Обновите страницу.`;
}

export function invalidScoreMessage(criterionTitle: string, maxScore: number): string {
  return `Баллы по критерию «${criterionTitle}» — от 0 до ${maxScore}.`;
}
