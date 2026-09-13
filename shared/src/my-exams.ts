// Кабинет ученика: что он видит про свои экзамены (`GET /me/exams`, слой 4.1
// API, docs/PLAN.md §11). Отдельным файлом, потому что exams.ts упёрся в
// лимит размера (CLAUDE.md «Храповики»); здесь только взгляд ученика на свои
// попытки — форма и снимок живут в exams.ts, рубрика в exam-rubric.ts.
import type { ExamAttemptStatus } from './exams';
import type { GradingCriterionDto, GradingOutcome } from './exam-rubric';

// Экран ученика (`/me/exams`, docs/PLAN.md §11 слой 4.1 API) — опубликованные
// формы и положение самого ученика по каждой: сколько попыток он уже начал и
// что с последней (её `id`, чтобы экран мог открыть «продолжить»/посмотреть
// сдачу). Не ExamDto — ученику до старта попытки не нужны блоки формы
// (вопросы открывает `/exams/:id/attempts`, слой 4.4), только положение.

/** Положение по последней попытке — только то, что нужно экрану ученика:
 * открыть её (`id`), понять, что с ней (`status`), и увидеть итог, если
 * оценка уже выставлена (слой 4.6). `outcome`/`comment`/`criteria` — только
 * из своей оценки: ученик не видит ни оценок другого ученика, ни критериев
 * проверки вопроса (`ExamItemDto.criteria`/снимок `criteria` вопроса) — это
 * поле рубрики (`GradingCriterionDto`), не question-level критерий (правило
 * PLAN §11 «Границы»: итог качественный, баллы по рубрике — разбор
 * собственной работы, не рейтинг между учениками). */
export interface MyExamAttemptSummaryDto {
  id: string;
  status: ExamAttemptStatus;
  outcome?: GradingOutcome;
  comment?: string;
  criteria?: GradingCriterionDto[];
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
