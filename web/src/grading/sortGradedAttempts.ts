// Чистая логика сортировки раздела «Проверенные» (GradingQueueScreen.tsx,
// docs/PLAN.md §4.6) — вынесена из компонента, чтобы проверяться без React
// и без DOM (CLAUDE.md «Логика вне контроллеров и компонентов»). Сервер
// сортирует список попыток по `startedAt` (ExamAttemptsService.list) — для
// этого раздела нужен другой порядок: свежепроверенное сверху.
import type { ExamAttemptDto } from '@xuanxue/shared';

/** Сортировка по `gradedAt` лексикографически работает как по времени,
 * потому что формат фиксирован (UTC c `Z`, тот же приём, что
 * planning/groupLessonsByDay.ts) — по убыванию, свежие сверху. Без
 * `gradedAt` (защита от рассинхрона данных — у попытки со статусом
 * `graded` оценка есть всегда) строка уходит в конец, не роняет сортировку. */
export function sortGradedAttempts(attempts: ExamAttemptDto[]): ExamAttemptDto[] {
  return [...attempts].sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? ''));
}
