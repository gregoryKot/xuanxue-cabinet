// Маршруты кабинета (React.lazy на экраны — CLAUDE.md «Фронтенд»: тяжёлые
// экраны не тянутся в стартовый бандл). AuthProvider — единственный источник
// сессии для всего дерева (ErrorBoundary и тост обновления PWA — здесь, а не
// в main.tsx: main.tsx остаётся тонкой точкой входа).
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonLines } from '../components/Skeleton';
import { UpdateToast } from '../pwa/UpdateToast';
import { AppShell } from './AppShell';

const LoginScreen = lazy(() => import('../auth/LoginScreen'));
const ScheduleScreen = lazy(() => import('../schedule/ScheduleScreen'));
const SummaryScreen = lazy(() => import('../summary/SummaryScreen'));
const PlanningScreen = lazy(() => import('../planning/PlanningScreen'));
const ChannelsScreen = lazy(() => import('../channels/ChannelsScreen'));
const BroadcastsScreen = lazy(() => import('../broadcasts/BroadcastsScreen'));
const TemplatesScreen = lazy(() => import('../templates/TemplatesScreen'));

const routeFallback = (
  <main style={{ padding: 24 }}>
    <SkeletonLines widths={['60%', '80%', '40%']} />
  </main>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={routeFallback}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/summary" element={<SummaryScreen />} />
                <Route path="/schedule" element={<ScheduleScreen />} />
                <Route path="/planning" element={<PlanningScreen />} />
                <Route path="/channels" element={<ChannelsScreen />} />
                <Route path="/broadcasts" element={<BroadcastsScreen />} />
                <Route path="/templates" element={<TemplatesScreen />} />
                <Route path="/" element={<Navigate to="/summary" replace />} />
              </Route>
            </Route>
            {/* Неизвестный путь — на главную, а не белый экран 404. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <UpdateToast />
      </AuthProvider>
    </ErrorBoundary>
  );
}
