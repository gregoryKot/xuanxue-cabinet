// Гвард маршрутов кабинета (SECURITY §2: роль — только из /auth/me). Гость
// уходит на /login; сетевой сбой — «Нет связи…» с повтором, не редирект (не
// путать «нет интернета» с «вы вышли», ревью п.2). Роль (учитель/ученик)
// смотрит уже AppShell — здесь только «есть сессия или нет».
import { Navigate, Outlet } from 'react-router-dom';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from './AuthProvider';

const OFFLINE_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

export function RequireAuth() {
  const { status, refresh } = useAuth();

  if (status === 'loading') {
    return (
      <main style={{ padding: 24 }}>
        <SkeletonLines widths={['60%', '80%', '40%']} />
      </main>
    );
  }

  if (status === 'offline') {
    return (
      <main style={{ padding: 24 }}>
        <p role="alert">{OFFLINE_MESSAGE}</p>
        <Button variant="secondary" onClick={() => void refresh()}>
          Повторить
        </Button>
      </main>
    );
  }

  if (status === 'guest') return <Navigate to="/login" replace />;

  return <Outlet />;
}
