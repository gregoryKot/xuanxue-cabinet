// Окно `GET /lessons` для предпросмотра шаблона (docs/PLAN.md §6 «Шаблоны»,
// pr-k3-fixes.md п.1) — от текущего момента на PLANNING_HORIZON_WEEKS вперёд,
// тот же горизонт, что у «Планирования». Вынесено в чистую функцию, чтобы
// проверить точную арифметику отдельно от хука данных (CLAUDE.md «Тесты»).
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { shiftByWeeks } from '../lib/dateWindow';

export interface NextLessonsWindow {
  from: string;
  to: string;
}

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»). */
export function nextLessonsWindow(now: Date = new Date()): NextLessonsWindow {
  const to = shiftByWeeks(now, PLANNING_HORIZON_WEEKS);
  return { from: now.toISOString(), to: to.toISOString() };
}
