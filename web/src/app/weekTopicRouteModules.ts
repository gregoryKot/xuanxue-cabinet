// Страница «Тема недели» (ADR-0197) — часть ROUTE_MODULES (routeModules.ts),
// вынесена отдельным файлом по той же причине, что eventRouteModules.ts:
// таблица уже за четыреста строк, а храповик размера не даёт ей расти.
// Порядок важен: в ROUTE_MODULES спред стоит ВЫШЕ `lessonEditor`
// (`/planning/:lessonId`), иначе матчер примет `week-topic` за id занятия.
import { CLASSES_LIST_PATH, lessonsListPath } from '../api/apiPaths';
import type { RouteModule } from './routeModules';

export const WEEK_TOPIC_ROUTE_MODULES = {
  weekTopic: {
    path: '/planning/week-topic/:weekKey',
    load: () => import('../planning/WeekTopicScreen'),
    warm: true,
    prefetch: () => [lessonsListPath(), CLASSES_LIST_PATH],
  },
} satisfies Record<string, RouteModule>;
