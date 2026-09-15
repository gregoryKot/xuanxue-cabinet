// Маршруты кабинета (React.lazy на экраны — CLAUDE.md «Фронтенд»: тяжёлые
// экраны не тянутся в стартовый бандл). Пути и загрузчики чанков — из
// routeModules.ts: оттуда же их берёт предзагрузка (main.tsx,
// usePrefetchRoutes.ts), и два списка не разъезжаются.
// AuthProvider — единственный источник сессии для всего дерева (ErrorBoundary
// — здесь, а не в main.tsx: main.tsx остаётся тонкой точкой входа).
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { RequirePeopleAccess } from '../auth/RequirePeopleAccess';
import { RequireAuth } from '../auth/RequireAuth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonLines } from '../components/Skeleton';
import { AppShell } from './AppShell';
import { ROOT_REDIRECT_PATH, ROUTE_MODULES } from './routeModules';

const LoginScreen = lazy(ROUTE_MODULES.login.load);
const EmailLoginCallbackScreen = lazy(ROUTE_MODULES.emailLogin.load);
const JoinScreen = lazy(ROUTE_MODULES.join.load);
const ScheduleScreen = lazy(ROUTE_MODULES.schedule.load);
const PlanningScreen = lazy(ROUTE_MODULES.planning.load);
const ChannelsScreen = lazy(ROUTE_MODULES.channels.load);
const BroadcastsScreen = lazy(ROUTE_MODULES.broadcasts.load);
const TemplatesScreen = lazy(ROUTE_MODULES.templates.load);
const PeopleScreen = lazy(ROUTE_MODULES.people.load);
const ExamItemsScreen = lazy(ROUTE_MODULES.examItems.load);
const ExamsScreen = lazy(ROUTE_MODULES.exams.load);
const ExamEditorScreen = lazy(ROUTE_MODULES.examEditor.load);
const GradingQueueScreen = lazy(ROUTE_MODULES.grading.load);
const AttemptReviewScreen = lazy(ROUTE_MODULES.attemptReview.load);
const AttemptScreen = lazy(ROUTE_MODULES.attempt.load);
const NotificationsScreen = lazy(ROUTE_MODULES.notifications.load);

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
              <Route element={<AppShell />}>
                <Route path={ROUTE_MODULES.schedule.path} element={<ScheduleScreen />} />
                <Route path={ROUTE_MODULES.planning.path} element={<PlanningScreen />} />
                <Route path={ROUTE_MODULES.channels.path} element={<ChannelsScreen />} />
                <Route
                  path={ROUTE_MODULES.broadcasts.path}
                  element={<BroadcastsScreen />}
                />
                <Route
                  path={ROUTE_MODULES.templates.path}
                  element={<TemplatesScreen />}
                />
                <Route
                  path={ROUTE_MODULES.examItems.path}
                  element={<ExamItemsScreen />}
                />
                <Route path={ROUTE_MODULES.exams.path} element={<ExamsScreen />} />
                {/* Редактор экзамена — страница со своим адресом, а не лист
                    поверх списка (ADR-0033): на него ссылаются из списка, его
                    можно открыть по ссылке и вернуться «Назад» браузера.
                    `/exams/new` объявлен раньше `/exams/:examId` — статический
                    кусок пути должен выигрывать у параметра. */}
                <Route path={ROUTE_MODULES.examNew.path} element={<ExamEditorScreen />} />
                <Route
                  path={ROUTE_MODULES.examEditor.path}
                  element={<ExamEditorScreen />}
                />
                {/* Проверка работ (слой 4.6) — тот же раздел «Экзамены», вход
                    карточкой на ExamsScreen.tsx, не пункт меню (ADR-0025).
                    Роль на самом маршруте не нужна: AppShell.tsx уже отдаёт
                    Outlet только TEACHER_ROLES, ученик здесь не окажется
                    (как /exam-items), а API дополнительно закрыт ролью на
                    контроллере (ExamAttemptsController). */}
                <Route
                  path={ROUTE_MODULES.grading.path}
                  element={<GradingQueueScreen />}
                />
                <Route
                  path={ROUTE_MODULES.attemptReview.path}
                  element={<AttemptReviewScreen />}
                />
                {/* Личная настройка человека, не раздел домена — вход из
                    подвала AppShell.tsx, не из NAV_ITEMS (ТЗ
                    notifications-web.md, docs/adr/0025). Доступна и ученику:
                    AppShell.tsx рисует здесь Outlet независимо от роли. */}
                <Route
                  path={ROUTE_MODULES.notifications.path}
                  element={<NotificationsScreen />}
                />
                {/* Экран сдачи — доступен любой роли (ТЗ student-exams.md:
                    учитель тоже проходит форму изнутри), вход — кнопка
                    «Начать»/«Продолжить» на StudentExamsSection.tsx. Как
                    «/notifications», AppShell.tsx отдаёт под него Outlet и
                    ученику, минуя StudentScreen. */}
                <Route path={ROUTE_MODULES.attempt.path} element={<AttemptScreen />} />
                {/* «Ученики» — четвёртый пункт NAV_ITEMS (navItems.ts).
                    Маршрут открыт admin и teacher (RequirePeopleAccess,
                    docs/PLAN.md §6, ADR-0030 — ссылку-приглашение отдаёт и
                    учитель); роспись ролей и удаление данных внутри экрана
                    остаются только у admin (SECURITY §3). */}
                <Route element={<RequirePeopleAccess />}>
                  <Route path={ROUTE_MODULES.people.path} element={<PeopleScreen />} />
                </Route>
                <Route path="/" element={<Navigate to={ROOT_REDIRECT_PATH} replace />} />
              </Route>
            </Route>
            {/* Неизвестный путь — на главную, а не белый экран 404. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}
