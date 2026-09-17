// Гвард маршрутов кабинета (SECURITY §2: роль — только из /auth/me). Гость
// уходит на /login; сетевой сбой — «Нет связи…» с повтором, не редирект (не
// путать «нет интернета» с «вы вышли», ревью п.2); заблокированный (сессия
// есть, AuthGuard отверг 403-м) видит отказ прямо здесь, не /login — там он
// снова нажал бы «Войти» и снова получил бы тот же отказ (ревью PR #150). Роль
// (учитель/ученик) смотрит уже AppShell — здесь только «есть сессия и пускать
// ли», статус самого человека (`me.status`) сюда не смотрит: `blocked` решает
// не он, а ответ /auth/me целиком (403 vs 200, AuthProvider.tsx).
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from './AuthProvider';
import { LogoutButton } from './LogoutButton';
import { saveReturnTo } from './returnTo';

const OFFLINE_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

export function RequireAuth() {
  const { status, refresh } = useAuth();
  const location = useLocation();

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

  if (status === 'blocked') {
    // Не редирект: заблокированный на /login снова ввёл бы те же данные и
    // снова получил 403 — петля (ревью PR #150 — та же петля, что у email-входа).
    // LogoutButton даёт выйти и попробовать другим аккаунтом.
    return (
      <main style={{ padding: 24 }}>
        <p role="alert">{ACCESS_MESSAGE}</p>
        <LogoutButton />
      </main>
    );
  }

  if (status === 'guest') {
    // Запоминаем экран, с которого ушёл гость (аудит L2) — все точки после
    // входа читают его через returnTo.ts. saveReturnTo сама отбрасывает
    // небезопасный путь и /login, так что дублировать проверку здесь не нужно.
    saveReturnTo(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
