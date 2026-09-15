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
const EmailLoginCallbackScreen = lazy(() => import('../auth/EmailLoginCallbackScreen'));
const JoinScreen = lazy(() => import('../join/JoinScreen'));
const ScheduleScreen = lazy(() => import('../schedule/ScheduleScreen'));
const PlanningScreen = lazy(() => import('../planning/PlanningScreen'));
const ChannelsScreen = lazy(() => import('../channels/ChannelsScreen'));
const BroadcastsScreen = lazy(() => import('../broadcasts/BroadcastsScreen'));
const TemplatesScreen = lazy(() => import('../templates/TemplatesScreen'));
const PeopleScreen = lazy(() => import('../people/PeopleScreen'));
const ExamItemsScreen = lazy(() => import('../exam-items/ExamItemsScreen'));
const ExamsScreen = lazy(() => import('../exams/ExamsScreen'));
const GradingQueueScreen = lazy(() => import('../grading/GradingQueueScreen'));
const AttemptReviewScreen = lazy(() => import('../grading/AttemptReviewScreen'));
const AttemptScreen = lazy(() => import('../attempt/AttemptScreen'));
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
            {/* Ссылка из письма входа (ADR-0029) — публичный маршрут, как
                /login: страница сама решает по токену, что показать. */}
            <Route path="/login/email" element={<EmailLoginCallbackScreen />} />
            {/* Ссылка-приглашение школы (ADR-0030) — публичный маршрут: до
                входа проверяет код сама (useJoinByInvite.ts), внутрь
                RequireAuth не идёт — гостю ещё нечего показывать из кабинета. */}
            <Route path="/join/:code" element={<JoinScreen />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/schedule" element={<ScheduleScreen />} />
                <Route path="/planning" element={<PlanningScreen />} />
                <Route path="/channels" element={<ChannelsScreen />} />
                <Route path="/broadcasts" element={<BroadcastsScreen />} />
                <Route path="/templates" element={<TemplatesScreen />} />
                <Route path="/exam-items" element={<ExamItemsScreen />} />
                <Route path="/exams" element={<ExamsScreen />} />
                {/* Проверка работ (слой 4.6) — тот же раздел «Экзамены», вход
                    карточкой на ExamsScreen.tsx, не пункт меню (ADR-0025).
                    Роль на самом маршруте не нужна: AppShell.tsx уже отдаёт
                    Outlet только TEACHER_ROLES, ученик здесь не окажется
                    (как /exam-items), а API дополнительно закрыт ролью на
                    контроллере (ExamAttemptsController). */}
                <Route path="/grading" element={<GradingQueueScreen />} />
                <Route path="/grading/:attemptId" element={<AttemptReviewScreen />} />
                {/* Личная настройка человека, не раздел домена — вход из
                    подвала AppShell.tsx, не из NAV_ITEMS (ТЗ
                    notifications-web.md, docs/adr/0025). Доступна и ученику:
                    AppShell.tsx рисует здесь Outlet независимо от роли. */}
                <Route path="/notifications" element={<NotificationsScreen />} />
                {/* Экран сдачи — доступен любой роли (ТЗ student-exams.md:
                    учитель тоже проходит форму изнутри), вход — кнопка
                    «Начать»/«Продолжить» на StudentExamsSection.tsx. Как
                    «/notifications», AppShell.tsx отдаёт под него Outlet и
                    ученику, минуя StudentScreen. */}
                <Route path="/attempts/:id" element={<AttemptScreen />} />
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
