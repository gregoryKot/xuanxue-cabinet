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

const NEXT_LESSONS_LIMIT = 5;

/** Query `GET /lessons` для выбора занятия в предпросмотре: окно выше и
 * первые NEXT_LESSONS_LIMIT. Одно место и для хука (useNextLessons.ts), и
 * для строки пути предзагрузки (apiPaths.ts, nextLessonsPath) — порядок полей
 * задаёт строку, а строка — ключ кэша. */
export function nextLessonsQuery(now?: Date): {
  from: string;
  to: string;
  limit: number;
} {
  const { from, to } = nextLessonsWindow(now);
  return { from, to, limit: NEXT_LESSONS_LIMIT };
}
