// Таблица экранов: путь маршрута и загрузка его чанка — в одном месте
// (CLAUDE.md «одна механика — один компонент»). Отсюда берут и `lazy()` с
// `<Route>` в App.tsx, и предзагрузка (main.tsx, usePrefetchRoutes.ts): два
// списка разъехались бы на первом же новом экране.
//
// Зачем предзагрузка. Измерено на проде 2026-09-15: TTFB любого ответа
// сервера — 0.5–1.1 с, а первый экран рисовался только после пяти
// последовательных шагов (index.html → главный JS → GET /api/auth/me → чанк
// экрана → данные экрана). Четвёртый шаг здесь лишний: `React.lazy` начинает
// качать чанк, только когда RequireAuth отрендерит `<Outlet>`, то есть уже
// получив ответ про сессию. Зная адрес, чанк можно начать качать сразу —
// `import()` одного модуля второй раз в сеть не идёт, и `lazy()` потом
// получает уже загруженный модуль.
import type { ComponentType } from 'react';

/** Загрузка чанка экрана — динамический `import()` его модуля. */
type RouteLoader = () => Promise<{ default: ComponentType }>;

interface RouteModule {
  /** Путь ровно как в `<Route path>`, включая `:параметры`. */
  path: string;
  load: RouteLoader;
  /** Греть ли чанк в фоне после входа: экраны входа вошедшему не нужны. */
  warm: boolean;
}

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
  },
  planning: {
    path: ROOT_REDIRECT_PATH,
    load: () => import('../planning/PlanningScreen'),
    warm: true,
  },
  channels: {
    path: '/channels',
    load: () => import('../channels/ChannelsScreen'),
    warm: true,
  },
  broadcasts: {
    path: '/broadcasts',
    load: () => import('../broadcasts/BroadcastsScreen'),
    warm: true,
  },
  templates: {
    path: '/templates',
    load: () => import('../templates/TemplatesScreen'),
    warm: true,
  },
  examItems: {
    path: '/exam-items',
    load: () => import('../exam-items/ExamItemsScreen'),
    warm: true,
  },
  exams: { path: '/exams', load: () => import('../exams/ExamsScreen'), warm: true },
  // `/exams/new` раньше `/exams/:examId`: matchRouteLoader берёт первое
  // совпадение, а статический сегмент должен выигрывать у параметра.
  examNew: {
    path: '/exams/new',
    load: () => import('../exams/ExamEditorScreen'),
    warm: true,
  },
  examEditor: {
    path: '/exams/:examId',
    load: () => import('../exams/ExamEditorScreen'),
    warm: true,
  },
  grading: {
    path: '/grading',
    load: () => import('../grading/GradingQueueScreen'),
    warm: true,
  },
  attemptReview: {
    path: '/grading/:attemptId',
    load: () => import('../grading/AttemptReviewScreen'),
    warm: true,
  },
  notifications: {
    path: '/notifications',
    load: () => import('../notifications/NotificationsScreen'),
    warm: true,
  },
  attempt: {
    path: '/attempts/:id',
    load: () => import('../attempt/AttemptScreen'),
    warm: true,
  },
  people: { path: '/people', load: () => import('../people/PeopleScreen'), warm: true },
} satisfies Record<string, RouteModule>;

/** Сегменты пути без пустых: «/grading/abc/» → ['grading', 'abc']. */
function segmentsOf(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchesPattern(pattern: string, pathname: string): boolean {
  const patternSegments = segmentsOf(pattern);
  const pathSegments = segmentsOf(pathname);
  if (patternSegments.length !== pathSegments.length) return false;
  // Сегмент-параметр (`:attemptId`) совпадает с любым непустым значением.
  return patternSegments.every(
    (segment, index) => segment.startsWith(':') || segment === pathSegments[index],
  );
}

/**
 * Чанк какого экрана нужен для этого адреса. `null` — адрес не наш
 * (App.tsx уведёт такой на главную, грузить заранее нечего).
 */
export function matchRouteLoader(pathname: string): RouteLoader | null {
  const target = segmentsOf(pathname).length === 0 ? ROOT_REDIRECT_PATH : pathname;
  const found = Object.values(ROUTE_MODULES).find((route) =>
    matchesPattern(route.path, target),
  );
  return found?.load ?? null;
}
