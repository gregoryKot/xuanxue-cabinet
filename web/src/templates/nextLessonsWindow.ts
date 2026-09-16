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

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»).
 *
 * Начало окна округляется вниз до целой минуты: этот же путь строит
 * предзагрузка первого экрана (api/apiPaths.ts, nextLessonsPath) за секунды
 * до хука данных, а ключ кэша — сама строка запроса. С точностью до
 * миллисекунды две строки не совпали бы никогда, и предзагрузка «Шаблонов»
 * была бы лишним запросом. Продуктового смысла у секунд здесь нет: занятие,
 * начавшееся полминуты назад, для предпросмотра всё ещё «ближайшее». */
export function nextLessonsWindow(now: Date = new Date()): NextLessonsWindow {
  const from = new Date(now);
  from.setUTCSeconds(0, 0);
  const to = shiftByWeeks(from, PLANNING_HORIZON_WEEKS);
  return { from: from.toISOString(), to: to.toISOString() };
}
