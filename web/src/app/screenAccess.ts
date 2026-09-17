// Кому отдаётся Outlet маршрута, а не StudentScreen — правило одно, а
// потребителей два: AppShell.tsx решает, что нарисовать, prefetchFirstScreen.ts
// решает, что предзагрузить для той же роли и того же адреса. Раньше правило
// жило только в AppShell.tsx — вторая копия в prefetchFirstScreen.ts
// разъехалась бы с ней на первой же правке ролей (CLAUDE.md «Одна механика —
// один компонент»). Статуса «ждёт подтверждения» больше нет (ADR-0036):
// вошедший всегда либо штат, либо ученик — по статусу здесь ничего не
// ветвится, `blocked` до этого кода не доходит (RequireAuth показывает отказ).
import type { MeDto } from '@xuanxue/shared';

const TEACHER_ROLES = new Set(['teacher', 'assistant', 'admin']);
const NOTIFICATIONS_PATH = '/notifications';
const ATTEMPT_PATH_PREFIX = '/attempts/';

/** teacher/assistant/admin — штат школы: ему навигация и экраны маршрутов;
 * без этих ролей человек — ученик (ADR-0026/0036), ему StudentScreen. */
export function isTeacher(me: MeDto | null): boolean {
  if (!me) return false;
  return me.roles.some((role) => TEACHER_ROLES.has(role));
}

/** «/notifications» (личная настройка человека) и «/attempts/:id» (экран
 * сдачи) — Outlet рисуется любой роли; остальные маршруты кабинета — только
 * teacher/assistant/admin, иначе AppShell рисует StudentScreen (ADR-0025,
 * ТЗ notifications-web.md/student-exams.md). */
export function showsRouteScreen(me: MeDto | null, pathname: string): boolean {
  // «/notifications»/«/attempts/:id» совпадают вне зависимости от `me` — так
  // было и в исходном выражении AppShell.tsx: оба экрана открыты любой роли.
  return (
    isTeacher(me) ||
    pathname === NOTIFICATIONS_PATH ||
    pathname.startsWith(ATTEMPT_PATH_PREFIX)
  );
}
