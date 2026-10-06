// Таблица экранов: путь маршрута, загрузка чанка и что предзагрузить для
// него — в одном месте (CLAUDE.md «одна механика — один компонент»). Отсюда
// берут и `lazy()` с `<Route>` в App.tsx, и предзагрузка чанков (main.tsx,
// usePrefetchRoutes.ts), и предзагрузка данных первого экрана
// (prefetchFirstScreen.ts, через routeMatch.ts).
//
// Зачем предзагрузка чанка. Измерено на проде 2026-09-15: TTFB любого ответа
// сервера — 0.5–1.1 с, а первый экран рисовался только после пяти
// последовательных шагов (index.html → главный JS → GET /api/auth/me → чанк
// экрана → данные экрана). Четвёртый шаг здесь лишний: `React.lazy` начинает
// качать чанк, только когда RequireAuth отрендерит `<Outlet>`, то есть уже
// получив ответ про сессию. Зная адрес, чанк можно начать качать сразу —
// `import()` одного модуля второй раз в сеть не идёт, и `lazy()` потом
// получает уже загруженный модуль.
//
// Зачем `prefetch`. Пятый шаг был лишним по той же причине: хук данных
// (useAbortableFetch) стартует запрос, только когда экран уже смонтирован —
// то есть уже после чанка. `prefetch` называет GET-пути, которые можно
// запросить сразу после ответа `/auth/me`, параллельно с чанком —
// prefetchFirstScreen.ts кладёт их в prefetchCache.ts, а apiFetch хука
// экрана заберёт готовый промис при монтировании.
import type { ComponentType } from 'react';
import { APP_ERRORS_SCREEN_PATH, GOOGLE_LOGIN_CALLBACK_PATH } from '@xuanxue/shared';
import {
  CLASSES_LIST_PATH,
  EXAM_EDITOR_ITEMS_PATH,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  INVITE_LINK_PATH,
  LESSON_RECORDING_SUMMARY_PATH,
  MY_EXAMS_PATH,
  MY_LESSONS_ARCHIVE_PATH,
  MY_LESSONS_PATH,
  MY_MATERIALS_PATH,
  NOTIFICATIONS_FEED_PATH,
  NOTIFICATION_PREFS_PATH,
  SETTINGS_PATH,
  TEACHERS_PATH,
  channelsListPath,
  examItemsListPath,
  examsListPath,
  lessonsListPath,
  materialsListPath,
  nextLessonsPath,
} from '../api/apiPaths';
import { ACCESSIBILITY_PATH } from '../accessibility/accessibilityPath';
import { apiRoutePath } from '../api/apiRoute';
import {
  GRADED_ATTEMPTS_PATH,
  GRADING_QUEUE_PATH,
  attemptPath,
  attemptReviewPath,
} from '../api/gradingPaths';
import { MY_LESSON_NOTIFICATIONS_PATH } from '../api/lessonScopePaths';
import { paymentsListPath } from '../api/paymentsApiPaths';
import { TAGS_LIST_PATH } from '../api/tagsApiPaths';
import { INSTALL_SCREEN_PATH } from '../install/installPath';
import { NOTIFICATION_SETTINGS_PATH } from '../notifications/notificationPaths';
import { PAYMENTS_SCREEN_PATH } from '../payments/paymentsPath';

/** Загрузка чанка экрана — динамический `import()` его модуля. */
export type RouteLoader = () => Promise<{ default: ComponentType }>;

/** GET-пути данных этого экрана — что предзагрузить (prefetchFirstScreen.ts). */
type RoutePrefetch = (pathname: string) => string[];

export interface RouteModule {
  /** Путь ровно как в `<Route path>`, включая `:параметры`. */
  path: string;
  load: RouteLoader;
  /** Греть ли чанк в фоне после входа: экраны входа вошедшему не нужны. */
  warm: boolean;
  /** Нет — у экрана нет данных первого экрана (только форма создания и т.п.). */
  prefetch?: RoutePrefetch;
}

/** Сегменты пути без пустых: «/grading/abc/» → ['grading', 'abc']. Экспорт —
 * routeMatch.ts строит из них matchRoute(), не дублируя разбор строки. */
export function segmentsOf(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Последний сегмент адреса — `:id` из `/schedule/:classId`. Зовут только
 * prefetch-замыкания редакторов ниже, для адреса, уже совпавшего с `/x/:id`
 * (routeMatch.ts), — сегмент есть всегда; `slice().join()` вместо `?? ''`,
 * чтобы не держать ветку «адрес пустой», которой не бывает. */
function lastSegment(pathname: string): string {
  return segmentsOf(pathname).slice(-1).join('');
}

/** `:examId` из `/exams/:examId/preview` — сегмент перед статическим
 * хвостом; те же оговорки, что у lastSegment. */
function segmentBeforeLast(pathname: string): string {
  return segmentsOf(pathname).slice(-2, -1).join('');
}

/** Параметры записи редактора для `apiRoutePath('GET /коллекция/:id', …)`:
 * `:id` — последний сегмент адреса, если не указан другой. */
const recordOf = (pathname: string, pick = lastSegment) => ({
  params: { id: pick(pathname) },
});

// Редактор — одна пара адресов на экран: `/x/new` и `/x/:id`, один загрузчик
// на оба (ADR-0033). `/x/new` всегда объявлен раньше `/x/:id`: matchRoute
// берёт первое совпадение, а статический сегмент должен выигрывать у параметра.
const loadChannelEditor = () => import('../channels/ChannelEditorScreen');
const loadExamEditor = () => import('../exams/ExamEditorScreen');
const loadExamItemEditor = () => import('../exam-items/ExamItemEditorScreen');
const loadMaterialEditor = () => import('../materials/MaterialEditorScreen');
const loadLessonEditor = () => import('../planning/LessonEditorScreen');
const loadClassEditor = () => import('../schedule/ClassEditorScreen');

export const ROUTE_MODULES = {
  login: { path: '/login', load: () => import('../auth/LoginScreen'), warm: false },
  emailLogin: {
    path: '/login/email',
    load: () => import('../auth/EmailLoginCallbackScreen'),
    warm: false,
  },
  // Возврат из Google (ADR-0145) — публичный маршрут, как login/emailLogin
  // выше: не требует сессии, вошедшему чанк не нужен.
  googleLogin: {
    path: GOOGLE_LOGIN_CALLBACK_PATH,
    load: () => import('../auth/GoogleLoginCallbackScreen'),
    warm: false,
  },
  join: { path: '/join/:code', load: () => import('../join/JoinScreen'), warm: false },
  // Политика конфиденциальности (ADR-0145) — публичный маршрут, открыт и
  // гостю, и вошедшему (без редиректа), вошедшему чанк не нужен заранее.
  privacy: {
    path: '/privacy',
    load: () => import('../privacy/PrivacyScreen'),
    warm: false,
  },
  // Заявление о доступности (ADR-0158) — публичный маршрут, как privacy выше.
  accessibility: {
    path: ACCESSIBILITY_PATH,
    load: () => import('../accessibility/AccessibilityScreen'),
    warm: false,
  },
  // Подтверждение почты вторым ключом входа (ADR-0059) — публичный маршрут,
  // как login/emailLogin/join: не требует сессии и не выдаёт её (комментарий
  // в EmailConfirmScreen.tsx), вошедшему чанк не нужен, греть в фоне нечего.
  emailConfirm: {
    path: '/email/confirm',
    load: () => import('../auth/EmailConfirmScreen'),
    warm: false,
  },
  // Экран первого входа (ADR-0044) — как login/emailLogin/join, вошедшему,
  // который уже назвался, чанк не нужен, греть в фоне нечего.
  welcome: {
    path: '/welcome',
    load: () => import('../welcome/WelcomeScreen'),
    warm: false,
  },
  schedule: {
    path: '/schedule',
    load: () => import('../schedule/ScheduleScreen'),
    warm: true,
    // ScheduleScreen.tsx грузит и классы, и активные каналы сразу на монтировании.
    prefetch: () => [CLASSES_LIST_PATH, channelsListPath(true)],
  },
  classNew: {
    path: '/schedule/new',
    load: loadClassEditor,
    warm: true,
    // Новому занятию читать нечего (useEntityEditor не шлёт запрос без id),
    // но форма всё равно ждёт активные каналы (ClassEditorScreen.tsx), а
    // список учителей форма запрашивает уже после них (ClassEditorForm.tsx
    // монтируется за LoadedPage) — третий шаг цепочки, греем и его.
    prefetch: () => [channelsListPath(true), TEACHERS_PATH],
  },
  classEditor: {
    path: '/schedule/:classId',
    load: loadClassEditor,
    warm: true,
    prefetch: (pathname) => [
      apiRoutePath('GET /classes/:id', recordOf(pathname)),
      channelsListPath(true),
      TEACHERS_PATH,
    ],
  },
  planning: {
    path: '/planning',
    load: () => import('../planning/PlanningScreen'),
    warm: true,
    // Число раздела (ТЗ docs/PLAN.md §14, слой 3.5) — тем же приёмом, что
    // EXAM_ITEM_STATS_SUMMARY_PATH у `/exams` ниже: маленький, но отдельный
    // запрос экрана, который можно погреть параллельно с чанком.
    prefetch: () => [lessonsListPath(), CLASSES_LIST_PATH, LESSON_RECORDING_SUMMARY_PATH],
  },
  // Учителя — как у classNew: LessonEditorForm.tsx спрашивает их после
  // классов и самой записи.
  lessonNew: {
    path: '/planning/new',
    load: loadLessonEditor,
    warm: true,
    prefetch: () => [CLASSES_LIST_PATH, TEACHERS_PATH],
  },
  lessonEditor: {
    path: '/planning/:lessonId',
    load: loadLessonEditor,
    warm: true,
    prefetch: (pathname) => [
      apiRoutePath('GET /lessons/:id', recordOf(pathname)),
      CLASSES_LIST_PATH,
      TEACHERS_PATH,
    ],
  },
  channels: {
    path: '/channels',
    load: () => import('../channels/ChannelsScreen'),
    warm: true,
    prefetch: () => [channelsListPath(false)],
  },
  // Новому каналу читать нечего, и других данных на монтировании форма не
  // ждёт (ChannelEditorForm.tsx) — prefetch не нужен.
  channelNew: { path: '/channels/new', load: loadChannelEditor, warm: true },
  channelEditor: {
    path: '/channels/:channelId',
    load: loadChannelEditor,
    warm: true,
    prefetch: (pathname) => [apiRoutePath('GET /channels/:id', recordOf(pathname))],
  },
  // «Материалы» — пятый пункт меню штата (ADR-0055). Занятия расписания
  // нужны и списку (MaterialCard.tsx), и форме (MaterialClassesField.tsx) —
  // греем их вместе с самим ресурсом.
  materials: {
    path: '/materials',
    load: () => import('../materials/MaterialsScreen'),
    warm: true,
    prefetch: () => [materialsListPath(''), CLASSES_LIST_PATH],
  },
  materialNew: {
    path: '/materials/new',
    load: loadMaterialEditor,
    warm: true,
    prefetch: () => [CLASSES_LIST_PATH],
  },
  // Выдача по тегу (ADR-0075/0078) — раньше materialEditor, как любое `/x/new`.
  materialsTags: {
    path: '/materials/tags',
    load: () => import('../materials/MaterialsTagsScreen'),
    warm: true,
    // Тег в prefetch(pathname) недоступен — греем то, что не зависит от выбора.
    prefetch: () => [TAGS_LIST_PATH, CLASSES_LIST_PATH],
  },
  materialEditor: {
    path: '/materials/:materialId',
    load: loadMaterialEditor,
    warm: true,
    prefetch: (pathname) => [
      apiRoutePath('GET /materials/:id', recordOf(pathname)),
      CLASSES_LIST_PATH,
    ],
  },
  broadcasts: {
    path: '/broadcasts',
    load: () => import('../broadcasts/BroadcastsScreen'),
    warm: true,
    // Окно журнала зависит от search params экрана — единого пути для всех
    // адресов «/broadcasts» нет, греть нечего.
  },
  // Правки у разовой рассылки нет — только «новая» (ADR-0033): созданную
  // рассылку API не меняет, из журнала её можно лишь отменить.
  broadcastNew: {
    path: '/broadcasts/new',
    load: () => import('../broadcasts/BroadcastNewScreen'),
    warm: true,
  },
  templates: {
    path: '/templates',
    load: () => import('../templates/TemplatesScreen'),
    warm: true,
    prefetch: () => [SETTINGS_PATH, nextLessonsPath()],
  },
  examItems: {
    path: '/exam-items',
    load: () => import('../exam-items/ExamItemsScreen'),
    warm: true,
    prefetch: () => [examItemsListPath('')],
  },
  // Новому вопросу читать нечего, других данных форма не ждёт
  // (ExamItemEditorForm.tsx) — prefetch не нужен.
  examItemNew: { path: '/exam-items/new', load: loadExamItemEditor, warm: true },
  examItemEditor: {
    path: '/exam-items/:itemId',
    load: loadExamItemEditor,
    warm: true,
    prefetch: (pathname) => [apiRoutePath('GET /exam-items/:id', recordOf(pathname))],
  },
  exams: {
    path: '/exams',
    load: () => import('../exams/ExamsScreen'),
    warm: true,
    prefetch: () => [
      examsListPath({ status: '' }),
      GRADING_QUEUE_PATH,
      EXAM_ITEM_STATS_SUMMARY_PATH,
    ],
  },
  examNew: {
    path: '/exams/new',
    load: loadExamEditor,
    warm: true,
    // Вопросы грузятся и у нового экзамена — с удалёнными (ExamEditorForm.tsx).
    prefetch: () => [EXAM_EDITOR_ITEMS_PATH],
  },
  examEditor: {
    path: '/exams/:examId',
    load: loadExamEditor,
    warm: true,
    prefetch: (pathname) => [
      apiRoutePath('GET /exams/:id', recordOf(pathname)),
      EXAM_EDITOR_ITEMS_PATH,
    ],
  },
  // Предпросмотр «глазами ученика» — страница, а не слой поверх редактора
  // (ADR-0033). Данные те же, что у редактора: экзамен и вопросы целиком.
  examPreview: {
    path: '/exams/:examId/preview',
    load: () => import('../exams/ExamPreviewScreen'),
    warm: true,
    prefetch: (pathname) => [
      apiRoutePath('GET /exams/:id', recordOf(pathname, segmentBeforeLast)),
      EXAM_EDITOR_ITEMS_PATH,
    ],
  },
  grading: {
    path: '/grading',
    load: () => import('../grading/GradingQueueScreen'),
    warm: true,
    prefetch: () => [GRADING_QUEUE_PATH, GRADED_ATTEMPTS_PATH], // два раздела экрана
  },
  attemptReview: {
    path: '/grading/:attemptId',
    load: () => import('../grading/AttemptReviewScreen'),
    warm: true,
    prefetch: (pathname) => [attemptReviewPath(lastSegment(pathname))],
  },
  profile: {
    path: '/profile',
    load: () => import('../profile/ProfileScreen'),
    warm: true,
  },
  // Как поставить кабинет на телефон (docs/PWA.md) — личное место, как
  // «/profile» выше: вход карточкой в оболочке (install/InstallAppCard.tsx) и
  // с «Профиля», не пункт меню. Данных с сервера нет — prefetch не нужен.
  install: {
    path: INSTALL_SCREEN_PATH,
    load: () => import('../install/InstallAppScreen'),
    warm: true,
  },
  // Личное место человека, не раздел домена — как «/profile» выше, вход не из
  // навигации разделов, а значком в оболочке (ADR-0025, ADR-0063). Открыт
  // любой роли (screenAccess.ts, canSeeRoute).
  notifications: {
    path: '/notifications',
    load: () => import('../notifications/NotificationsScreen'),
    warm: true,
    prefetch: () => [
      NOTIFICATIONS_FEED_PATH,
      MY_EXAMS_PATH,
      MY_LESSON_NOTIFICATIONS_PATH,
    ],
  },
  // Подэкран ленты (ADR-0162): вход с «Профиля» и из ленты, открыт любой роли.
  // Занятия (тут и в ленте) греются только тому, у кого есть вид про занятие, —
  // это решает prefetchFirstScreen.ts, таблица от роли не зависит.
  notificationSettings: {
    path: NOTIFICATION_SETTINGS_PATH,
    load: () => import('../notifications/NotificationSettingsScreen'),
    warm: true,
    prefetch: () => [NOTIFICATION_PREFS_PATH, MY_LESSON_NOTIFICATIONS_PATH],
  },
  // «Задания» и «Занятия» ученика (решение владельца: экзамены — отдельный
  // экран и первый после входа, docs/PLAN.md §11) — как «/profile» выше,
  // открыты любой роли (screenAccess.ts, canSeeRoute).
  tasks: {
    path: '/tasks',
    load: () => import('../student/TasksScreen'),
    warm: true,
    prefetch: () => [MY_EXAMS_PATH],
  },
  studentLessons: {
    path: '/lessons',
    load: () => import('../student/LessonsScreen'),
    warm: true,
    prefetch: () => [MY_LESSONS_PATH],
  },
  // «Записи занятий» (слой 3.3, docs/PLAN.md §14) — подэкран «Занятий», вход
  // карточкой SectionLink на LessonsScreen.tsx, не пункт меню (ADR-0025), тот
  // же приём, что у «Библиотеки» ученика (library ниже).
  archive: {
    path: '/archive',
    load: () => import('../student/ArchiveScreen'),
    warm: true,
    prefetch: () => [MY_LESSONS_ARCHIVE_PATH],
  },
  // «Библиотека» ученика (слой 3.2, docs/PLAN.md §14) — подэкран «Занятий»,
  // вход карточкой SectionLink на LessonsScreen.tsx, не пункт меню
  // (ADR-0025), тот же приём, что у «Записей занятий» (archive) выше.
  library: {
    path: '/library',
    load: () => import('../student/LibraryScreen'),
    warm: true,
    prefetch: () => [MY_MATERIALS_PATH],
  },
  attempt: {
    path: '/attempts/:id',
    load: () => import('../attempt/AttemptScreen'),
    warm: true,
    // Своя попытка своим адресом (ADR-0126), как у редакторов записей выше.
    prefetch: (pathname) => [attemptPath(lastSegment(pathname))],
  },
  people: {
    path: '/people',
    load: () => import('../people/PeopleScreen'),
    warm: true,
    // Список учеников (GET /users) — только для admin, учителю сервер
    // ответит 403 (people/usePeople.ts) — не греем. Ссылка-приглашение
    // грузится независимо от роли (InviteLinkCard.tsx/useInviteLink.ts).
    prefetch: () => [INVITE_LINK_PATH],
  },
  payments: {
    path: PAYMENTS_SCREEN_PATH,
    load: () => import('../payments/PaymentsScreen'),
    warm: true,
    // Первый запрос usePayments (ADR-0171): месяц выбирает сервер.
    prefetch: () => [paymentsListPath(null)],
  },
  // Журнал сбоев (ADR-0132) — только admin (RequireDevErrorsAccess.tsx), вход
  // карточкой SectionLink на «Профиле» (ADR-0025), не пункт меню. Чужая роль
  // сюда не заходит вовсе — прогревать чанк для каждого штата незачем
  // (warm: false), в отличие от «Людей» выше, открытых и teacher.
  devErrors: {
    path: APP_ERRORS_SCREEN_PATH,
    load: () => import('../dev-errors/DevErrorsScreen'),
    warm: false,
  },
} satisfies Record<string, RouteModule>;
