// Гвард маршрута «Оплаты» (ADR-0151): бухгалтер и админ. Учитель по прямому
// адресу /payments уходит на свой корень — иначе экран открылся бы и сразу
// показал отказ сервера (403, SECURITY §3). Сессия уже проверена RequireAuth
// выше в дереве маршрутов — здесь только роль, по образцу RequirePeopleAccess.
import { Navigate, Outlet } from 'react-router-dom';
import { canSeePayments, rootPathFor } from '../app/screenAccess';
import { useAuth } from './AuthProvider';

export function RequirePaymentsAccess() {
  const { me } = useAuth();

  if (!canSeePayments(me)) return <Navigate to={rootPathFor(me)} replace />;
  return <Outlet />;
}
