// Кабинет ученика: что он видит про свои экзамены (`GET /me/exams`, слой 4.1
// API, docs/PLAN.md §11). Отдельным файлом, потому что exams.ts упёрся в
// лимит размера (CLAUDE.md «Храповики»); здесь только взгляд ученика на свои
// попытки — форма и снимок живут в exams.ts, итог проверки — в
// exam-grading.ts.
import type { ExamAttemptStatus } from './exams';
import type { GradingOutcome } from './exam-grading';

// Экран ученика (`/me/exams`, docs/PLAN.md §11 слой 4.1 API) — опубликованные
// формы и положение самого ученика по каждой: сколько попыток он уже начал и
// что с последней (её `id`, чтобы экран мог открыть «продолжить»/посмотреть
// сдачу). Не ExamDto — ученику до старта попытки не нужны блоки формы
// (вопросы открывает `/exams/:id/attempts`, слой 4.4), только положение.

/** Положение по последней попытке — только то, что нужно экрану ученика:
 * открыть её (`id`), понять, что с ней (`status`), и увидеть итог с
 * комментарием учителя, если оценка уже выставлена (слой 4.6). `outcome`/
 * `comment` — только из своей оценки: ученик не видит ни оценок другого
 * ученика, ни критериев проверки вопроса (`ExamItemDto.criteria`) — итог
 * качественный, без баллов (PLAN §11 «Границы»). */
interface MyExamAttemptSummaryDto {
  id: string;
  status: ExamAttemptStatus;
  /** Попытку закрыло время, а не сам ученик. Разные вещи для того, что
   * предложить дальше: после дедлайна человек не «обходит проверку», он её
   * не успел пройти (решение владельца 2026-09-21). */
  expired: boolean;
  outcome?: GradingOutcome;
  comment?: string;
}

export interface MyExamDto {
  id: string;
  title: string;
  description: string;
  level: string;
  attemptsAllowed: number;
  /** Сколько попыток этот ученик уже начал по этой форме (включая
   * незаконченные) — не «сколько осталось»: экран сам сравнит с
   * `attemptsAllowed`, а форма ответа за вычитание не отвечает. */
  attemptsUsed: number;
  /** Отсутствует, если ученик ещё не начинал попытку по этой форме. */
  lastAttempt?: MyExamAttemptSummaryDto;
}

export interface ListMyExamsQuery {
  limit?: number;
}

export type MyExamAction = 'continue' | 'start' | 'retry' | null;

/** Сколько попыток ещё можно начать — не «сколько уже потрачено»: кабинет и
 * бот сравнивают именно остаток с нулём, вычитание не дублируется в каждом
 * месте (переезжает из web/src/student/examAttemptState.ts, тот же
 * комментарий). Не в минус: учитель мог уменьшить лимит формы уже после
 * того, как ученик прошёл её несколько раз по старому лимиту. */
export function myExamAttemptsLeft(exam: MyExamDto): number {
  return Math.max(0, exam.attemptsAllowed - exam.attemptsUsed);
}

/** Одна кнопка по смыслу — что кабинету и боту предложить ученику дальше по
 * его последней попытке. `continue` — она ещё открыта, `start` — попытки не
 * было вовсе, `retry` — можно начать заново, `null` — нажимать нечего,
 * причину экран объясняет текстом сам (кабинет и бот — разными словами).
 *
 * Единственная функция на два экрана (CLAUDE.md «Одна механика — один
 * компонент»): до 2026-09-21 кабинет и бот решали это каждый по-своему, и
 * бот пускал на новую попытку любую сданную работу, включая ещё не
 * проверенную, — то самое «обход проверки», которое кабинет как раз
 * запрещал. Решение владельца 2026-09-21 провело границу по `expired`, не
 * по `status` в одиночку: `submitted` без `expired` — ученик сдал сам и
 * ждёт итога, вторая попытка тут была бы попыткой получить другую оценку за
 * ту же работу; `submitted` с `expired: true` — ученика прервало время, а
 * не проверка, и ждать ему нечего. `graded` — учитель уже посмотрел и мог
 * попросить доработать, поэтому разрешён независимо от `expired`.
 *
 * `attemptsUsed < attemptsAllowed` на сервере (`ExamAttemptsService.start`)
 * не тронуто и не должно: лимит попыток остаётся настоящей защитой, эта
 * функция только решает, что ПРЕДЛОЖИТЬ нажать, не что РАЗРЕШЕНО серверу
 * (ADR-0093). */
export function getMyExamAction(exam: MyExamDto): MyExamAction {
  if (exam.lastAttempt?.status === 'in_progress') return 'continue';
  if (myExamAttemptsLeft(exam) <= 0) return null;
  if (!exam.lastAttempt) return 'start';
  if (exam.lastAttempt.status === 'graded') return 'retry';
  if (exam.lastAttempt.status === 'submitted' && exam.lastAttempt.expired) return 'retry';
  return null;
}
