// Старый адрес ведёт на новый, не теряя `?query` и `#hash`: ссылки бота на
// `/planning#lesson-{id}` и закладки учителей живут дольше переименования
// раздела (ADR-0198).
import { Navigate, useLocation } from 'react-router-dom';

export function LegacyPathRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
