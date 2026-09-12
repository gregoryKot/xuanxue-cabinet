// Маршруты кабинета (React.lazy на экраны — CLAUDE.md «Фронтенд»: тяжёлые
// экраны не тянутся в стартовый бандл). AuthProvider — единственный источник
// сессии для всего дерева (ErrorBoundary и тост обновления PWA — здесь, а не
// в main.tsx: main.tsx остаётся тонкой точкой входа).
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAdmin } from '../auth/RequireAdmin';
import { RequireAuth } from '../auth/RequireAuth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonLines } from '../components/Skeleton';
import { UpdateToast } from '../pwa/UpdateToast';
import { AppShell } from './AppShell';

const LoginScreen = lazy(() => import('../auth/LoginScreen'));
const ScheduleScreen = lazy(() => import('../schedule/ScheduleScreen'));
const PlanningScreen = lazy(() => import('../planning/PlanningScreen'));
const ChannelsScreen = lazy(() => import('../channels/ChannelsScreen'));
const BroadcastsScreen = lazy(() => import('../broadcasts/BroadcastsScreen'));
const TemplatesScreen = lazy(() => import('../templates/TemplatesScreen'));
const PeopleScreen = lazy(() => import('../people/PeopleScreen'));
const ExamItemsScreen = lazy(() => import('../exam-items/ExamItemsScreen'));
const ExamsScreen = lazy(() => import('../exams/ExamsScreen'));
const NotificationsScreen = lazy(() => import('../notifications/NotificationsScreen'));

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
                <Route path="/schedule" element={<ScheduleScreen />} />
                <Route path="/planning" element={<PlanningScreen />} />
                <Route path="/channels" element={<ChannelsScreen />} />
                <Route path="/broadcasts" element={<BroadcastsScreen />} />
                <Route path="/templates" element={<TemplatesScreen />} />
                <Route path="/exam-items" element={<ExamItemsScreen />} />
                <Route path="/exams" element={<ExamsScreen />} />
                {/* Личная настройка человека, не раздел домена — вход из
                    подвала AppShell.tsx, не из NAV_ITEMS (ТЗ
                    notifications-web.md, docs/adr/0025). Доступна и ученику:
                    AppShell.tsx рисует здесь Outlet независимо от роли. */}
                <Route path="/notifications" element={<NotificationsScreen />} />
                {/* «Ученики» — четвёртый пункт NAV_ITEMS (navItems.ts), но
                    маршрут доступен только admin (RequireAdmin, docs/PLAN.md
                    §6, блокер аудита Б3) — GET /users того же требует. */}
                <Route element={<RequireAdmin />}>
                  <Route path="/people" element={<PeopleScreen />} />
                </Route>
                <Route path="/" element={<Navigate to="/planning" replace />} />
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
