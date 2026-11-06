// Раздел «Расписание» (ADR-0198) — часть ROUTE_MODULES (routeModules.ts),
// вынесен отдельным файлом по той же причине, что weekTopicRouteModules.ts:
// таблица за четыреста строк, а храповик размера не даёт ей расти.
// Порядок важен: в ROUTE_MODULES спред стоит ВЫШЕ `classNew`/`classEditor`
// (`/schedule/:classId`), иначе матчер примет `rules` за id занятия.
import {
  CHANNELS_LIST_PATH,
  CLASSES_LIST_PATH,
  LESSON_RECORDING_SUMMARY_PATH,
  lessonsListPath,
} from '../api/apiPaths';
import { apiRoutePath } from '../api/apiRoute';
import type { RouteModule } from './routeModules';

export const SCHEDULE_ROUTE_MODULES = {
  // Недели занятий. Каналы и группы нужны строке «ссылка дойдёт не до всех»
  // (RulesDeliveryNotice.tsx): без них она появилась бы позже остального.
  schedule: {
    path: '/schedule',
    load: () => import('../planning/PlanningScreen'),
    warm: true,
    prefetch: () => [
      lessonsListPath(),
      CLASSES_LIST_PATH,
      LESSON_RECORDING_SUMMARY_PATH,
      CHANNELS_LIST_PATH,
      apiRoutePath('GET /groups'),
    ],
  },
  // Правила недели — подэкран; классы и активные каналы грузятся на монтировании.
  weekRules: {
    path: '/schedule/rules',
    load: () => import('../schedule/WeekRulesScreen'),
    warm: true,
    prefetch: () => [CLASSES_LIST_PATH, CHANNELS_LIST_PATH],
  },
} satisfies Record<string, RouteModule>;
