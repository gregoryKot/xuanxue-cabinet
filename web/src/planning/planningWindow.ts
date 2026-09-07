// Окно запроса `GET /lessons` для «Планирования» (docs/PLAN.md §6 п.3):
// от начала текущей недели (Вс, 00:00 в поясе браузера) на PLANNING_HORIZON_WEEKS
// вперёд — ровно тот же горизонт, что держит планировщик занятий заполненным
// (api/src/lessons/lesson-planner.service.ts), запрашивать шире незачем, а
// `assertListWindow` на сервере запрещает окно у́же и шире 4 недель.
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';

export interface PlanningWindow {
  from: string;
  to: string;
}

const MS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»): без него граница
 * недели зависела бы от момента запуска. */
export function planningWindow(now: Date = new Date()): PlanningWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // ближайшее воскресенье назад
  // Ровно PLANNING_HORIZON_WEEKS * 7 * 24 часов в UTC, не «тот же час по
  // местному времени 28 дней спустя»: `setDate(+28)` держит локальную стену
  // (00:00 по браузеру), и на переходе зимнего/летнего времени Asia/Jerusalem
  // разница `to − from` в UTC становится 28 дней ± 1 час — сервер
  // (`api/src/common/date-window.ts`, `assertWindow` в UTC) отвечает 400, и
  // «Планирование» не открывается в неделю перехода.
  const end = new Date(start.getTime() + PLANNING_HORIZON_WEEKS * MS_IN_WEEK);
  return { from: start.toISOString(), to: end.toISOString() };
}
