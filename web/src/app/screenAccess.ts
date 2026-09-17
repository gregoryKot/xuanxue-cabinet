// Кому отдаётся Outlet маршрута, а не StudentScreen — правило одно, а
// потребителей два: AppShell.tsx решает, что нарисовать, prefetchFirstScreen.ts
// решает, что предзагрузить для той же роли и того же адреса. Раньше правило
// жило только в AppShell.tsx — вторая копия в prefetchFirstScreen.ts
// разъехалась бы с ней на первой же правке ролей (CLAUDE.md «Одна механика —
// один компонент»).
import type { MeDto } from '@xuanxue/shared';

const TEACHER_ROLES = new Set(['teacher', 'assistant', 'admin']);
const NOTIFICATIONS_PATH = '/notifications';
const ATTEMPT_PATH_PREFIX = '/attempts/';
const PENDING_STATUS = 'invited';

/** Ждёт подтверждения школы (ADR-0026): разделов у него ещё нет ни одного,
 * API закрыт — AppShell рисует экран ожидания, предзагрузке греть нечего. */
export function isPending(me: MeDto | null): boolean {
  return me?.status === PENDING_STATUS;
}

/** invited не бывает teacher/admin (школа подтверждает раньше, чем даёт
 * роль) — но проверка явная, а не понадеявшись на это: человеку, который
 * ещё ничего не видит, рисовать навигацию (и греть данные экрана) нельзя. */
export function isTeacher(me: MeDto | null): boolean {
  if (!me || isPending(me)) return false;
  return me.roles.some((role) => TEACHER_ROLES.has(role));
}

/** «/notifications» (личная настройка человека) и «/attempts/:id» (экран
 * сдачи) — Outlet рисуется любой роли; остальные маршруты кабинета — только
 * teacher/assistant/admin, иначе AppShell рисует StudentScreen (ADR-0025,
 * ТЗ notifications-web.md/student-exams.md). */
export function showsRouteScreen(me: MeDto | null, pathname: string): boolean {
  // «/notifications»/«/attempts/:id» совпадают вне зависимости от `me` —
  // так было и в исходном выражении AppShell.tsx. Это не дыра: у invited
  // решает AppShell.tsx (PendingApprovalScreen рисуется раньше проверки
  // Outlet) и prefetchFirstScreen.ts (свой ранний выход на invited раньше
  // вызова этой функции) — оба проверяют статус сами, до этой функции.
  return (
    isTeacher(me) ||
    pathname === NOTIFICATIONS_PATH ||
    pathname.startsWith(ATTEMPT_PATH_PREFIX)
  );
}
