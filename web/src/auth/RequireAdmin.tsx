// Гвард маршрута «Люди» (docs/PLAN.md §6, блокер аудита Б3, SECURITY §3):
// назначение ролей — только admin, не любой teacher. Сессия уже проверена
// RequireAuth выше в дереве маршрутов (App.tsx) — здесь только роль. Не
// путать с AppShell.isTeacher — тот решает «кабинет или StudentScreen»,
// этот — «можно ли конкретно на /people».
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { hasRole } from './hasRole';

export function RequireAdmin() {
  const { me } = useAuth();
  const isAdmin = hasRole(me, 'admin');

  if (!isAdmin) return <Navigate to="/planning" replace />;
  return <Outlet />;
}
