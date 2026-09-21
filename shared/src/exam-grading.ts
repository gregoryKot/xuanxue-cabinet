// Карточка проверки попытки и оценка (слой 4.6, PLAN §11, ADR-0022) — учитель
// смотрит ответы ученика и ставит итог с комментарием. Отдельный файл от
// exams.ts (CLAUDE.md «Храповики»: файл-лимит размера) — своя, достаточно
// большая подсистема поверх типов формы/попытки, а не продолжение самого
// экзамена.
import type { ExamMediaDto } from './exam-media';
import type { ExamAttemptStatus, ExamItemKind } from './exams';

// Итог проверки — качественный: зачёт, незачёт или «доработать», без баллов
// (PLAN §11 «Границы»).
export const GRADING_OUTCOMES = ['passed', 'failed', 'needs_work'] as const;
export type GradingOutcome = (typeof GRADING_OUTCOMES)[number];

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
  /** Картинка варианта (ADR-0035) — учитель видит её в карточке проверки
   * той же редакции, что видел сдающий: берётся из снимка попытки. */
  imageId?: string;
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
  /** Ученик оставил ответ по этому вопросу: выбрал хотя бы один вариант или
   * написал непустой текст. Отдельно от `optionsCheck`, потому что «не
   * отвечено» и «отвечено неверно» — разные вещи для проверяющего (отзыв
   * владельца 2026-09-21: «0 из 3» стояло и там, и там). У видео-вопроса
   * значения не имеет: ответ там — присланная запись (ADR-0037), а не
   * `answers` попытки. */
  answered: boolean;
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
  /** Дойдёт ли итог этому ученику в Telegram — то самое условие, по
   * которому реально шлёт `TelegramExamNotifier.notifyExamGraded`
   * (`PersonalChats.chatFor(userId, 'exam_result') !== null`: активный
   * личный чат с ботом и включённый вид «результат экзамена»). Не
   * опционально, в отличие от `media` ниже: там причина — старые фикстуры
   * web/, здесь «нет данных» не бывает — сервис всегда знает ответ на
   * момент сборки карточки. Заведено по отзыву владельца 2026-09-21:
   * строка «итог уйдёт в Telegram» стояла безусловно, а у конкретного
   * ученика Telegram может не быть (ADR-0099). Итог в любом случае виден
   * ученику в кабинете (InAppExamNotifier, ADR-0061) — это поле только про
   * канал Telegram. */
  notifiesUserInTelegram: boolean;
  /** Есть, только если оценка уже выставлена. */
  grading?: ExamGradingDto;
  /** Видео экзамена (слой 4.5, ADR-0023) — учитель видит в карточке проверки.
   * Опционально в типе по той же причине, что у `ExamAttemptDto.media`
   * (exams.ts): существующие фикстуры web/ не тронуты правкой контракта. */
  media?: ExamMediaDto[];
}

// Оценка попытки (`exam_gradings`, `PUT /attempts/:id/grading`) — данные
// ученика: `userId` — чей это итог, не того, кто проверял (`graderId`). Итог
// и комментарий уходят ученику в Telegram и переводят попытку в `graded`
// (PLAN §11).
export interface PutGradingInput {
  comment?: string;
  outcome: GradingOutcome;
}

export interface ExamGradingDto {
  id: string;
  attemptId: string;
  examId: string;
  userId: string;
  graderId: string;
  comment?: string;
  outcome: GradingOutcome;
  gradedAt: string; // ISO UTC с Z
}

export const GRADING_LIMITS = { comment: 2000 } as const;

// `userName` в `ExamAttemptDto` и `AttemptReviewDto` — человека могли уже
// удалить (аудит В11, `UserDeletionService.deleteAllUserData`); честная
// заглушка вместо пустой строки, одна на оба маршрута.
export const DELETED_USER_NAME = 'Аккаунт удалён';

// Правило ТЗ 4.6, п.2: проверить можно только сданную (или уже проверенную —
// повторный PUT переписывает оценку) работу, не черновик в работе.
export const ATTEMPT_NOT_SUBMITTED_MESSAGE =
  'Эту работу ещё нельзя проверить: ученик её не сдал. Дождитесь сдачи.';

// Текст «нет ответа» — один на кабинет и на бота (CLAUDE.md «Одна механика —
// один компонент»): до этой правки у каждого была своя строка («Ответ не
// дан.» / «Ответа нет.»), и совпадение слов было случайным, не гарантированным.
export const ATTEMPT_NO_ANSWER_TEXT = 'Ответа нет.';
