// Маршруты внутри кабинета — всё, что живёт под AppShell за RequireAuth.
// Вынесены из App.tsx отдельным списком: App.tsx остался про вход, охрану и
// корень дерева, а таблица экранов растёт здесь и не упирается в предел
// размера файла (CLAUDE.md «Храповики», check-file-size-ratchet).
//
// Пути и загрузчики чанков — из routeModules.ts (React.lazy: тяжёлые экраны
// не тянутся в стартовый бандл): оттуда же их берёт предзагрузка (main.tsx,
// usePrefetchRoutes.ts), и два списка не разъезжаются.
//
// Фрагмент, а не компонент: `<Routes>` разбирает детей сам и умеет заглянуть
// внутрь `<React.Fragment>`, а компонент между `<Route>` и его детьми сломал
// бы разбор.
import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { RequirePeopleAccess } from '../auth/RequirePeopleAccess';
import { ROOT_REDIRECT_PATH, ROUTE_MODULES } from './routeModules';

const ScheduleScreen = lazy(ROUTE_MODULES.schedule.load);
const ClassEditorScreen = lazy(ROUTE_MODULES.classEditor.load);
const PlanningScreen = lazy(ROUTE_MODULES.planning.load);
const LessonEditorScreen = lazy(ROUTE_MODULES.lessonEditor.load);
const ChannelsScreen = lazy(ROUTE_MODULES.channels.load);
const ChannelEditorScreen = lazy(ROUTE_MODULES.channelEditor.load);
const BroadcastsScreen = lazy(ROUTE_MODULES.broadcasts.load);
const BroadcastNewScreen = lazy(ROUTE_MODULES.broadcastNew.load);
const TemplatesScreen = lazy(ROUTE_MODULES.templates.load);
const PeopleScreen = lazy(ROUTE_MODULES.people.load);
const ExamItemsScreen = lazy(ROUTE_MODULES.examItems.load);
const ExamItemEditorScreen = lazy(ROUTE_MODULES.examItemEditor.load);
const ExamsScreen = lazy(ROUTE_MODULES.exams.load);
const ExamEditorScreen = lazy(ROUTE_MODULES.examEditor.load);
const ExamPreviewScreen = lazy(ROUTE_MODULES.examPreview.load);
const GradingQueueScreen = lazy(ROUTE_MODULES.grading.load);
const AttemptReviewScreen = lazy(ROUTE_MODULES.attemptReview.load);
const AttemptScreen = lazy(ROUTE_MODULES.attempt.load);
const NotificationsScreen = lazy(ROUTE_MODULES.notifications.load);

/* Занятие расписания, дата занятия, канал, рассылка, вопрос и экзамен
   правятся на страницах со своими адресами, а не в листах поверх списка
   (ADR-0033): на них ссылаются из списка, их открывают по ссылке и закрывают
   «Назад» браузера. Где есть и создание, и правка, `/…/new` объявлен раньше
   `/…/:id` — статический кусок пути должен выигрывать у параметра. */
export const cabinetRoutes = (
  <>
    <Route path={ROUTE_MODULES.schedule.path} element={<ScheduleScreen />} />
    <Route path={ROUTE_MODULES.classNew.path} element={<ClassEditorScreen />} />
    <Route path={ROUTE_MODULES.classEditor.path} element={<ClassEditorScreen />} />
    <Route path={ROUTE_MODULES.planning.path} element={<PlanningScreen />} />
    <Route path={ROUTE_MODULES.lessonNew.path} element={<LessonEditorScreen />} />
    <Route path={ROUTE_MODULES.lessonEditor.path} element={<LessonEditorScreen />} />
    <Route path={ROUTE_MODULES.channels.path} element={<ChannelsScreen />} />
    <Route path={ROUTE_MODULES.channelNew.path} element={<ChannelEditorScreen />} />
    <Route path={ROUTE_MODULES.channelEditor.path} element={<ChannelEditorScreen />} />
    <Route path={ROUTE_MODULES.broadcasts.path} element={<BroadcastsScreen />} />
    <Route path={ROUTE_MODULES.broadcastNew.path} element={<BroadcastNewScreen />} />
    <Route path={ROUTE_MODULES.templates.path} element={<TemplatesScreen />} />
    <Route path={ROUTE_MODULES.examItems.path} element={<ExamItemsScreen />} />
    <Route path={ROUTE_MODULES.examItemNew.path} element={<ExamItemEditorScreen />} />
    <Route path={ROUTE_MODULES.examItemEditor.path} element={<ExamItemEditorScreen />} />
    <Route path={ROUTE_MODULES.exams.path} element={<ExamsScreen />} />
    <Route path={ROUTE_MODULES.examNew.path} element={<ExamEditorScreen />} />
    <Route path={ROUTE_MODULES.examEditor.path} element={<ExamEditorScreen />} />
    {/* Последний полноэкранный слой кабинета, кроме ConfirmDialog, стал
        страницей (ADR-0033) — на неё ссылаются со страницы экзамена, «Назад»
        браузера возвращает к экзамену обычной навигацией, не закрытием листа. */}
    <Route path={ROUTE_MODULES.examPreview.path} element={<ExamPreviewScreen />} />
    {/* Проверка работ (слой 4.6) — тот же раздел «Экзамены», вход карточкой
        на ExamsScreen.tsx, не пункт меню (ADR-0025). Роль на самом маршруте
        не нужна: AppShell.tsx уже отдаёт Outlet только TEACHER_ROLES, ученик
        здесь не окажется (как /exam-items), а API дополнительно закрыт ролью
        на контроллере (ExamAttemptsController). */}
    <Route path={ROUTE_MODULES.grading.path} element={<GradingQueueScreen />} />
    <Route path={ROUTE_MODULES.attemptReview.path} element={<AttemptReviewScreen />} />
    {/* Личная настройка человека, не раздел домена — вход из подвала
        AppShell.tsx, не из NAV_ITEMS (ТЗ notifications-web.md, docs/adr/0025).
        Доступна и ученику: AppShell.tsx рисует здесь Outlet независимо от
        роли. */}
    <Route path={ROUTE_MODULES.notifications.path} element={<NotificationsScreen />} />
    {/* Экран сдачи — доступен любой роли (ТЗ student-exams.md: учитель тоже
        проходит форму изнутри), вход — кнопка «Начать»/«Продолжить» на
        StudentExamsSection.tsx. Как «/notifications», AppShell.tsx отдаёт под
        него Outlet и ученику, минуя StudentScreen. */}
    <Route path={ROUTE_MODULES.attempt.path} element={<AttemptScreen />} />
    {/* «Ученики» — четвёртый пункт NAV_ITEMS (navItems.ts). Маршрут открыт
        admin и teacher (RequirePeopleAccess, docs/PLAN.md §6, ADR-0030 —
        ссылку-приглашение отдаёт и учитель); роспись ролей и удаление данных
        внутри экрана остаются только у admin (SECURITY §3). */}
    <Route element={<RequirePeopleAccess />}>
      <Route path={ROUTE_MODULES.people.path} element={<PeopleScreen />} />
    </Route>
    <Route path="/" element={<Navigate to={ROOT_REDIRECT_PATH} replace />} />
  </>
);
