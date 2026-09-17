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
import {
  ATTEMPTS_LIST_PATH,
  CHANNELS_PATH,
  CLASSES_LIST_PATH,
  CLASSES_PATH,
  EXAMS_PATH,
  EXAM_ITEMS_PATH,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  GRADING_QUEUE_PATH,
  INVITE_LINK_PATH,
  LESSONS_PATH,
  NOTIFICATION_PREFS_PATH,
  SETTINGS_PATH,
  TEACHERS_PATH,
  attemptReviewPath,
  channelsListPath,
  entityPath,
  examItemsListPath,
  examsListPath,
  lessonsListPath,
  nextLessonsPath,
} from '../api/apiPaths';

/** Загрузка чанка экрана — динамический `import()` его модуля. */
type RouteLoader = () => Promise<{ default: ComponentType }>;

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

// Редактор — одна пара адресов на экран: `/x/new` и `/x/:id`, один загрузчик
// на оба (ADR-0033). `/x/new` всегда объявлен раньше `/x/:id`: matchRoute
// берёт первое совпадение, а статический сегмент должен выигрывать у параметра.
const loadChannelEditor = () => import('../channels/ChannelEditorScreen');
const loadExamEditor = () => import('../exams/ExamEditorScreen');
const loadExamItemEditor = () => import('../exam-items/ExamItemEditorScreen');
const loadLessonEditor = () => import('../planning/LessonEditorScreen');
const loadClassEditor = () => import('../schedule/ClassEditorScreen');

/** Куда ведёт корень `/` — и в `<Navigate>`, и при предзагрузке. */
export const ROOT_REDIRECT_PATH = '/planning';

export const ROUTE_MODULES = {
  login: { path: '/login', load: () => import('../auth/LoginScreen'), warm: false },
  emailLogin: {
    path: '/login/email',
    load: () => import('../auth/EmailLoginCallbackScreen'),
    warm: false,
  },
  join: { path: '/join/:code', load: () => import('../join/JoinScreen'), warm: false },
  schedule: {
    path: '/schedule',
    load: () => import('../schedule/ScheduleScreen'),
    warm: true,
    // ScheduleScreen.tsx грузит и классы, и активные каналы сразу на монтировании.
    prefetch: () => [CLASSES_LIST_PATH, channelsListPath(true)],
  },
  // `/schedule/new` раньше `/schedule/:classId`: matchRoute берёт первое
  // совпадение, а статический сегмент должен выигрывать у параметра.
  // Один загрузчик на оба адреса — это один и тот же экран (ADR-0033).
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
      entityPath(CLASSES_PATH, lastSegment(pathname)),
      channelsListPath(true),
      TEACHERS_PATH,
    ],
  },
  planning: {
    path: ROOT_REDIRECT_PATH,
    load: () => import('../planning/PlanningScreen'),
    warm: true,
    prefetch: () => [lessonsListPath(), CLASSES_LIST_PATH],
  },
  // `/planning/new` раньше `/planning/:lessonId` — по той же причине.
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
      entityPath(LESSONS_PATH, lastSegment(pathname)),
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
    prefetch: (pathname) => [entityPath(CHANNELS_PATH, lastSegment(pathname))],
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
    prefetch: (pathname) => [entityPath(EXAM_ITEMS_PATH, lastSegment(pathname))],
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
    // Вопросы грузятся на монтировании и у нового экзамена
    // (ExamEditorForm.tsx — без фильтра, поиск по ним локальный).
    prefetch: () => [examItemsListPath('')],
  },
  examEditor: {
    path: '/exams/:examId',
    load: loadExamEditor,
    warm: true,
    prefetch: (pathname) => [
      entityPath(EXAMS_PATH, lastSegment(pathname)),
      examItemsListPath(''),
    ],
  },
  // Предпросмотр «глазами ученика» — страница, а не слой поверх редактора
  // (ADR-0033). Данные те же, что у редактора: экзамен и вопросы целиком.
  examPreview: {
    path: '/exams/:examId/preview',
    load: () => import('../exams/ExamPreviewScreen'),
    warm: true,
    prefetch: (pathname) => [
      entityPath(EXAMS_PATH, segmentBeforeLast(pathname)),
      examItemsListPath(''),
    ],
  },
  grading: {
    path: '/grading',
    load: () => import('../grading/GradingQueueScreen'),
    warm: true,
    prefetch: () => [GRADING_QUEUE_PATH],
  },
  attemptReview: {
    path: '/grading/:attemptId',
    load: () => import('../grading/AttemptReviewScreen'),
    warm: true,
    prefetch: (pathname) => [attemptReviewPath(lastSegment(pathname))],
  },
  notifications: {
    path: '/notifications',
    load: () => import('../notifications/NotificationsScreen'),
    warm: true,
    prefetch: () => [NOTIFICATION_PREFS_PATH],
  },
  attempt: {
    path: '/attempts/:id',
    load: () => import('../attempt/AttemptScreen'),
    warm: true,
    // Своего GET /attempts/:id у API нет — экран ищет попытку в списке своих
    // (attempt/useAttempt.ts).
    prefetch: () => [ATTEMPTS_LIST_PATH],
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
} satisfies Record<string, RouteModule>;
