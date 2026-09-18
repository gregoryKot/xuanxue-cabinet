// Кому какие маршруты кабинета открыты, и куда вести дальше — правило одно,
// а потребителей несколько: AppShell.tsx решает, рисовать ли Outlet или
// увести редиректом; prefetchFirstScreen.ts решает, что предзагрузить для
// той же роли и того же адреса; cabinetRoutes.tsx зовёт rootPathFor для
// самого корня «/» (CLAUDE.md «Одна механика — один компонент»).
//
// Решение владельца: у ученика теперь два своих маршрута — «Задания»
// (/tasks, первый после входа) и «Занятия» (/lessons) — вместо экрана-
// подмены StudentScreen. Чужой маршрут (штата) ведёт на свой корень
// редиректом, не подменой содержимого.
//
// Статуса «ждёт подтверждения» больше нет (ADR-0036): вошедший всегда либо
// штат, либо ученик — по статусу здесь ничего не ветвится, `blocked` до
// этого кода не доходит (RequireAuth показывает отказ).
import type { MeDto } from '@xuanxue/shared';

const TEACHER_ROLES = new Set(['teacher', 'assistant', 'admin']);
const STAFF_ROOT_PATH = '/planning';
const STUDENT_TASKS_PATH = '/tasks';
const STUDENT_LESSONS_PATH = '/lessons';
const PROFILE_PATH = '/profile';
const ATTEMPT_PATH_PREFIX = '/attempts/';

/** teacher/assistant/admin — штат школы: ему навигация и маршруты штата;
 * без этих ролей человек — ученик (ADR-0026/0036), ему «Задания»/«Занятия». */
export function isTeacher(me: MeDto | null): boolean {
  if (!me) return false;
  return me.roles.some((role) => TEACHER_ROLES.has(role));
}

/** Куда вести сразу после входа и при отказе в чужом маршруте (AppShell.tsx,
 * cabinetRoutes.tsx). Решение владельца: у ученика первый экран — «Задания»
 * (экзамены), «Занятия» — второй; у штата по-прежнему «Занятия»/планирование. */
export function rootPathFor(me: MeDto | null): string {
  return isTeacher(me) ? STAFF_ROOT_PATH : STUDENT_TASKS_PATH;
}

/** «/tasks»/«/lessons» (два экрана ученика), «/profile» (личный экран,
 * ADR-0045) и «/attempts/:id» (экран сдачи) — открыты любой роли; остальные
 * маршруты кабинета — только teacher/assistant/admin, иначе AppShell уводит
 * редиректом на rootPathFor(me) (ADR-0025, ТЗ student-exams.md). */
export function canSeeRoute(me: MeDto | null, pathname: string): boolean {
  return (
    isTeacher(me) ||
    pathname === STUDENT_TASKS_PATH ||
    pathname === STUDENT_LESSONS_PATH ||
    pathname === PROFILE_PATH ||
    pathname.startsWith(ATTEMPT_PATH_PREFIX)
  );
}
