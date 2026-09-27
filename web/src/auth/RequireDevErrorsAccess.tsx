// Гвард маршрута «Сбои» (`/dev/errors`, ADR-0132) — журнал сбоя открыт только
// admin: текст ошибки может нести чужой ввод (тело запроса, стек), и на
// «Профиле» карточка входа видна тоже только admin (profile/ProfileScreen.tsx).
// Тот же приём, что у RequirePeopleAccess.tsx: сессия уже проверена
// RequireAuth выше в дереве маршрутов (App.tsx), здесь только роль.
// Редирект — на «/planning»: дошедший сюда без admin всегда штат школы
// (canSeeRoute, app/screenAccess.ts, уже не пускает ученика на маршруты
// штата вовсе, редирект на /planning срабатывает раньше, чем запрос
// доходит до этого гварда).
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { hasRole } from './hasRole';

export function RequireDevErrorsAccess() {
  const { me } = useAuth();

  if (!hasRole(me, 'admin')) return <Navigate to="/planning" replace />;
  return <Outlet />;
}
