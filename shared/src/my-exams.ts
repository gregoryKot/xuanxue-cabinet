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
