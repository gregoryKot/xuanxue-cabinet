// Маршруты внутри кабинета — всё, что живёт под AppShell за RequireAuth.
// Вынесены из App.tsx: тот остался про вход, охрану и корень дерева.
//
// Пути и загрузчики чанков — из routeModules.ts (React.lazy): оттуда же их
// берёт предзагрузка (main.tsx, usePrefetchRoutes.ts) — списки не разъезжаются.
//
// Фрагмент, а не компонент: `<Routes>` разбирает детей сам и умеет заглянуть
// внутрь `<React.Fragment>`, а компонент между `<Route>` и его детьми сломал
// бы разбор.
import { Navigate, Route } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { RequireDevErrorsAccess } from '../auth/RequireDevErrorsAccess';
import { RequirePaymentsAccess } from '../auth/RequirePaymentsAccess';
import { RequirePeopleAccess } from '../auth/RequirePeopleAccess';
import { lazyRoute } from './lazyRoute';
import { ROUTE_MODULES } from './routeModules';
import { rootPathFor } from './screenAccess';

const ScheduleScreen = lazyRoute(ROUTE_MODULES.schedule.load);
const ClassEditorScreen = lazyRoute(ROUTE_MODULES.classEditor.load);
const PlanningScreen = lazyRoute(ROUTE_MODULES.planning.load);
const LessonEditorScreen = lazyRoute(ROUTE_MODULES.lessonEditor.load);
const ChannelsScreen = lazyRoute(ROUTE_MODULES.channels.load);
const ChannelEditorScreen = lazyRoute(ROUTE_MODULES.channelEditor.load);
const MaterialsScreen = lazyRoute(ROUTE_MODULES.materials.load);
const MaterialsTagsScreen = lazyRoute(ROUTE_MODULES.materialsTags.load);
const MaterialEditorScreen = lazyRoute(ROUTE_MODULES.materialEditor.load);
const EventEditorScreen = lazyRoute(ROUTE_MODULES.eventEditor.load);
const BroadcastsScreen = lazyRoute(ROUTE_MODULES.broadcasts.load);
const BroadcastNewScreen = lazyRoute(ROUTE_MODULES.broadcastNew.load);
const TemplatesScreen = lazyRoute(ROUTE_MODULES.templates.load);
const SchoolScreen = lazyRoute(ROUTE_MODULES.school.load);
const PeopleScreen = lazyRoute(ROUTE_MODULES.people.load);
const PaymentsScreen = lazyRoute(ROUTE_MODULES.payments.load);
const ExamItemsScreen = lazyRoute(ROUTE_MODULES.examItems.load);
const ExamItemEditorScreen = lazyRoute(ROUTE_MODULES.examItemEditor.load);
const ExamsScreen = lazyRoute(ROUTE_MODULES.exams.load);
const ExamEditorScreen = lazyRoute(ROUTE_MODULES.examEditor.load);
const ExamPreviewScreen = lazyRoute(ROUTE_MODULES.examPreview.load);
const GradingQueueScreen = lazyRoute(ROUTE_MODULES.grading.load);
const AttemptReviewScreen = lazyRoute(ROUTE_MODULES.attemptReview.load);
const AttemptScreen = lazyRoute(ROUTE_MODULES.attempt.load);
const ProfileScreen = lazyRoute(ROUTE_MODULES.profile.load);
const InstallAppScreen = lazyRoute(ROUTE_MODULES.install.load);
const NotificationsScreen = lazyRoute(ROUTE_MODULES.notifications.load);
const NotificationSettingsScreen = lazyRoute(ROUTE_MODULES.notificationSettings.load);
const BoardScreen = lazyRoute(ROUTE_MODULES.board.load);
const TasksScreen = lazyRoute(ROUTE_MODULES.tasks.load);
const LessonsScreen = lazyRoute(ROUTE_MODULES.studentLessons.load);
const ArchiveScreen = lazyRoute(ROUTE_MODULES.archive.load);
const LibraryScreen = lazyRoute(ROUTE_MODULES.library.load);
const DevErrorsScreen = lazyRoute(ROUTE_MODULES.devErrors.load);

/** «/» — первый экран уже известной роли (владелец 2026-10-06: «Доска» при
 * любом входе — ADR-0173/0174; у бухгалтера «Оплаты», ADR-0171). Роль решает
 * rootPathFor (screenAccess.ts) — общая функция с AppShell.tsx, чтобы адрес
 * корня не разъехался с адресом редиректа при отказе в чужом маршруте. */
function RootRedirect() {
  const { me } = useAuth();
  return <Navigate to={rootPathFor(me)} replace />;
}

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
    {/* «Материалы» (ADR-0055): роль на маршруте не нужна, Outlet штата отдаёт AppShell.tsx. */}
    <Route path={ROUTE_MODULES.materials.path} element={<MaterialsScreen />} />
    <Route path={ROUTE_MODULES.materialNew.path} element={<MaterialEditorScreen />} />
    {/* Выдача по тегу (ADR-0075/0078) — подэкран «Материалов»; раньше
        /materials/:materialId: статический сегмент выигрывает у параметра. */}
    <Route path={ROUTE_MODULES.materialsTags.path} element={<MaterialsTagsScreen />} />
    <Route path={ROUTE_MODULES.materialEditor.path} element={<MaterialEditorScreen />} />
    {/* События школы (ADR-0177) — штат, ученику маршрут закрыт canSeeRoute. */}
    <Route path={ROUTE_MODULES.eventNew.path} element={<EventEditorScreen />} />
    <Route path={ROUTE_MODULES.eventEditor.path} element={<EventEditorScreen />} />
    <Route path={ROUTE_MODULES.broadcasts.path} element={<BroadcastsScreen />} />
    <Route path={ROUTE_MODULES.broadcastNew.path} element={<BroadcastNewScreen />} />
    <Route path={ROUTE_MODULES.templates.path} element={<TemplatesScreen />} />
    <Route path={ROUTE_MODULES.school.path} element={<SchoolScreen />} />
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
    {/* Личный экран человека (ADR-0045), вход из подвала кабинета и значком
        профиля, не из навигации разделов (docs/adr/0025). Открыт любой роли. */}
    <Route path={ROUTE_MODULES.profile.path} element={<ProfileScreen />} />
    {/* Как поставить кабинет на телефон (docs/PWA.md): личное место, как
        «/profile» выше, вход карточкой, не пункт меню. Открыт любой роли. */}
    <Route path={ROUTE_MODULES.install.path} element={<InstallAppScreen />} />
    {/* Лента событий и новых заданий (ADR-0063) — личное место человека, как
        «/profile» выше, вход значком в оболочке, не из навигации разделов
        (ADR-0025). Доступен любой роли: canSeeRoute (screenAccess.ts) не
        ограничивает его по роли. */}
    <Route path={ROUTE_MODULES.notifications.path} element={<NotificationsScreen />} />
    {/* «Настройки уведомлений» (ADR-0162) — подэкран ленты, вход с «Профиля» и
        из ленты; доступен любой роли, как она. */}
    <Route
      path={ROUTE_MODULES.notificationSettings.path}
      element={<NotificationSettingsScreen />}
    />
    {/* Экраны ученика, первый — «Доска» (ADR-0173); открыты любой роли. */}
    <Route path={ROUTE_MODULES.board.path} element={<BoardScreen />} />
    <Route path={ROUTE_MODULES.tasks.path} element={<TasksScreen />} />
    <Route path={ROUTE_MODULES.studentLessons.path} element={<LessonsScreen />} />
    {/* «Записи занятий» (слой 3.3) — подэкран «Занятий», вход карточкой на
        LessonsScreen.tsx, не пункт меню (ADR-0025), тот же приём, что у
        /materials выше. Роль на маршруте не нужна: canSeeRoute
        (screenAccess.ts) открывает его любой роли — учитель тоже может
        посмотреть архив занятий школы. */}
    <Route path={ROUTE_MODULES.archive.path} element={<ArchiveScreen />} />
    {/* «Библиотека» ученика (слой 3.2) — подэкран «Занятий», вход карточкой
        на LessonsScreen.tsx (ADR-0025), тот же приём, что у /archive выше.
        Роль на маршруте не нужна: canSeeRoute (screenAccess.ts) открывает
        его любой роли — учитель тоже может посмотреть библиотеку своими
        глазами. */}
    <Route path={ROUTE_MODULES.library.path} element={<LibraryScreen />} />
    {/* Экран сдачи — доступен любой роли (ТЗ student-exams.md: учитель тоже
        проходит форму изнутри), вход — кнопка «Начать»/«Продолжить» на
        TasksScreen.tsx. Как «/profile» выше, canSeeRoute открывает его
        независимо от роли. */}
    <Route path={ROUTE_MODULES.attempt.path} element={<AttemptScreen />} />
    {/* «Ученики» — четвёртый пункт STAFF_NAV_ITEMS (navItems.ts). Маршрут
        открыт admin и teacher (RequirePeopleAccess, docs/PLAN.md §6,
        ADR-0030 — ссылку-приглашение отдаёт и учитель); роспись ролей и
        удаление данных внутри экрана остаются только у admin (SECURITY §3). */}
    <Route element={<RequirePeopleAccess />}>
      <Route path={ROUTE_MODULES.people.path} element={<PeopleScreen />} />
    </Route>
    {/* «Оплаты» (ADR-0171): учителя гвард уводит на его корень, не на 403. */}
    <Route element={<RequirePaymentsAccess />}>
      <Route path={ROUTE_MODULES.payments.path} element={<PaymentsScreen />} />
    </Route>
    {/* Журнал сбоев (ADR-0132) — только admin (RequireDevErrorsAccess.tsx),
        вход карточкой SectionLink на «Профиле», не пункт меню (ADR-0025). */}
    <Route element={<RequireDevErrorsAccess />}>
      <Route path={ROUTE_MODULES.devErrors.path} element={<DevErrorsScreen />} />
    </Route>
    <Route path="/" element={<RootRedirect />} />
  </>
);
