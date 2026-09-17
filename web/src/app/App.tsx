// Корень дерева: вход, охрана сессии и подстановка маршрутов кабинета.
// Экраны кабинета живут своим списком (cabinetRoutes.tsx) — здесь остаются
// публичные страницы и то, что оборачивает всё остальное.
// AuthProvider — единственный источник сессии для всего дерева (ErrorBoundary
// — здесь, а не в main.tsx: main.tsx остаётся тонкой точкой входа).
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonLines } from '../components/Skeleton';
import { AppShell } from './AppShell';
import { cabinetRoutes } from './cabinetRoutes';
import { FirstScreenPrefetch } from './FirstScreenPrefetch';
import { ROUTE_MODULES } from './routeModules';

const LoginScreen = lazy(ROUTE_MODULES.login.load);
const EmailLoginCallbackScreen = lazy(ROUTE_MODULES.emailLogin.load);
const JoinScreen = lazy(ROUTE_MODULES.join.load);

const routeFallback = (
  <main style={{ padding: 24 }}>
    <SkeletonLines widths={['60%', '80%', '40%']} />
  </main>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        {/* Снаружи Suspense нарочно (см. комментарий-«почему» в
            FirstScreenPrefetch.tsx): под Suspense эффекты не запускаются, пока
            чанк экрана не пришёл — то есть ровно после него, а не параллельно. */}
        <FirstScreenPrefetch />
        <Suspense fallback={routeFallback}>
          <Routes>
            <Route path={ROUTE_MODULES.login.path} element={<LoginScreen />} />
            {/* Ссылка из письма входа (ADR-0029) — публичный маршрут, как
                /login: страница сама решает по токену, что показать. */}
            <Route
              path={ROUTE_MODULES.emailLogin.path}
              element={<EmailLoginCallbackScreen />}
            />
            {/* Ссылка-приглашение школы (ADR-0030) — публичный маршрут: до
                входа проверяет код сама (useJoinByInvite.ts), внутрь
                RequireAuth не идёт — гостю ещё нечего показывать из кабинета. */}
            <Route path={ROUTE_MODULES.join.path} element={<JoinScreen />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>{cabinetRoutes}</Route>
            </Route>
            {/* Неизвестный путь — на главную, а не белый экран 404. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}
