// Гвард маршрута «Люди» (docs/PLAN.md §6, блокер аудита Б3, SECURITY §3).
// Раньше пускал только admin (переименован из RequireAdmin, ADR-0030,
// уточнение владельца 2026-09-15): ссылку-приглашение отдаёт и teacher —
// экран открыт обоим, но назначение ролей и удаление данных внутри самого
// PeopleScreen.tsx всё равно видит только admin (SECURITY §3, не этот
// гвард). Сессия уже проверена RequireAuth выше в дереве маршрутов
// (App.tsx) — здесь только роль. Не путать с AppShell.canSeeRoute — тот
// решает «пускать на этот маршрут или увести редиректом», этот — «можно ли
// конкретно на /people».
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { hasRole } from './hasRole';

export function RequirePeopleAccess() {
  const { me } = useAuth();
  const canAccess = hasRole(me, 'admin') || hasRole(me, 'teacher');

  if (!canAccess) return <Navigate to="/planning" replace />;
  return <Outlet />;
}
