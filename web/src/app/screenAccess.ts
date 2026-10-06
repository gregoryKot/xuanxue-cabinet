// Кому какие маршруты кабинета открыты, и куда вести дальше — правило одно,
// а потребителей несколько: AppShell.tsx решает, рисовать ли Outlet или
// увести редиректом; prefetchFirstScreen.ts решает, что предзагрузить для
// той же роли и того же адреса; cabinetRoutes.tsx зовёт rootPathFor для
// самого корня «/» (CLAUDE.md «Одна механика — один компонент»).
//
// Решение владельца: у ученика свои маршруты — «Доска» (/board, первый после
// входа, ADR-0173), «Задания» (/tasks) и «Занятия» (/lessons) — вместо экрана-
// подмены StudentScreen. Чужой маршрут (штата) ведёт на свой корень
// редиректом, не подменой содержимого.
//
// «Доска» — первый экран и у штата (владелец 2026-10-06, ADR-0174): один
// маршрут, экран сам решает по роли, что на нём лежит (board/BoardScreen.tsx).
//
// Бухгалтер (роль accountant без ролей штата, ADR-0171) — третья роль по
// экранам: у него один свой маршрут «Оплаты» и он же корень после входа.
// Админ видит «Оплаты» подэкраном «Учеников», учитель их не видит вовсе.
//
// Статуса «ждёт подтверждения» больше нет (ADR-0036): вошедший всегда либо
// штат, либо ученик — по статусу здесь ничего не ветвится, `blocked` до
// этого кода не доходит (RequireAuth показывает отказ).
import type { MeDto } from '@xuanxue/shared';
import { hasRole } from '../auth/hasRole';
import { INSTALL_SCREEN_PATH } from '../install/installPath';
import {
  NOTIFICATIONS_SCREEN_PATH,
  NOTIFICATION_SETTINGS_PATH,
} from '../notifications/notificationPaths';
import { PAYMENTS_SCREEN_PATH } from '../payments/paymentsPath';

const TEACHER_ROLES = new Set(['teacher', 'assistant', 'admin']);
// «Доска» — первый экран после входа у ученика (ADR-0173) и у штата
// (ADR-0174). Экспортирован — routeMatch.ts строит из него EMPTY_PATH_FALLBACK,
// чтобы адрес корня и опорный путь для «/» не могли разъехаться (ADR-0138).
export const BOARD_PATH = '/board';
// «Задания» и «Занятия» — второй и третий пункты меню ученика.
const STUDENT_TASKS_PATH = '/tasks';
const STUDENT_LESSONS_PATH = '/lessons';
// Подэкран «Занятий» (слой 3.3, docs/PLAN.md §14) — вход карточкой на
// LessonsScreen.tsx, не отдельный пункт меню (ADR-0025), но свой маршрут
// нужно явно открыть ученику, как и сам «/lessons».
const STUDENT_ARCHIVE_PATH = '/archive';
// Подэкран «Занятий» (слой 3.2, docs/PLAN.md §14) — та же оговорка, что у
// STUDENT_ARCHIVE_PATH: вход карточкой, но маршрут открывается явно.
const STUDENT_LIBRARY_PATH = '/library';
const PROFILE_PATH = '/profile';
const ATTEMPT_PATH_PREFIX = '/attempts/';

/** teacher/assistant/admin — штат школы: ему навигация и маршруты штата;
 * без этих ролей человек — ученик (ADR-0026/0036), ему «Задания»/«Занятия». */
export function isTeacher(me: MeDto | null): boolean {
  if (!me) return false;
  return me.roles.some((role) => TEACHER_ROLES.has(role));
}

/** Оплаты видят бухгалтер и админ (ADR-0149/0151); учитель — нет: сервер
 * ответил бы ему 403 (SECURITY §3), а гвард RequirePaymentsAccess уводит его
 * на свой корень раньше. */
export function canSeePayments(me: MeDto | null): boolean {
  return hasRole(me, 'accountant') || hasRole(me, 'admin');
}

/** Бухгалтер без ролей штата: ему панель из одного пункта «Оплаты», а не
 * «Задания»/«Занятия» ученика. Бухгалтер, он же учитель или админ, — штат:
 * у него меню штата, «Оплаты» админа лежат внутри «Учеников» (ADR-0171). */
export function isAccountant(me: MeDto | null): boolean {
  return hasRole(me, 'accountant') && !isTeacher(me);
}

/** Куда вести сразу после входа и при отказе в чужом маршруте (AppShell.tsx,
 * cabinetRoutes.tsx). Решение владельца 2026-10-06: «Доска» — первый экран
 * при любом входе — у ученика (ADR-0173) и у штата (ADR-0174; до того с
 * 2026-09-27 штат попадал на «Экзамены», ADR-0138). Исключение — бухгалтер
 * без ролей штата: у него «Оплаты», единственный его экран (ADR-0171), а на
 * доске для него нет ничего — ни экзаменов, ни занятий, ни входа в оплаты. */
export function rootPathFor(me: MeDto | null): string {
  return isAccountant(me) ? PAYMENTS_SCREEN_PATH : BOARD_PATH;
}

/** «/board»/«/tasks»/«/lessons»/«/archive»/«/library» (экраны ученика), «/profile»
 * (личный экран, ADR-0045), «/install» (инструкция установки, docs/PWA.md),
 * «/notifications» (лента событий, ADR-0063), «/notifications/settings»
 * (настройки уведомлений, ADR-0162) и «/attempts/:id» (экран сдачи) — открыты
 * любой роли; «/payments» — тем, кто видит оплаты (canSeePayments); остальные
 * маршруты кабинета — только teacher/assistant/admin, иначе AppShell уводит
 * редиректом на rootPathFor(me) (ADR-0025, ТЗ student-exams.md). */
export function canSeeRoute(me: MeDto | null, pathname: string): boolean {
  // «Оплаты» решает роль оплат, а не «штат или нет»: учитель штата их не
  // видит, бухгалтер без ролей штата — видит (ADR-0171).
  if (pathname === PAYMENTS_SCREEN_PATH) return canSeePayments(me);
  return (
    isTeacher(me) ||
    pathname === BOARD_PATH ||
    pathname === STUDENT_TASKS_PATH ||
    pathname === STUDENT_LESSONS_PATH ||
    pathname === STUDENT_ARCHIVE_PATH ||
    pathname === STUDENT_LIBRARY_PATH ||
    pathname === PROFILE_PATH ||
    pathname === INSTALL_SCREEN_PATH ||
    pathname === NOTIFICATIONS_SCREEN_PATH ||
    pathname === NOTIFICATION_SETTINGS_PATH ||
    pathname.startsWith(ATTEMPT_PATH_PREFIX)
  );
}
