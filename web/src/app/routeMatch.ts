// Резолвер маршрута по адресу — вынесен из routeModules.ts (файл-храповик:
// после таблицы `prefetch` строк стало больше, чем «весит» само сопоставление
// пути с записью таблицы, CLAUDE.md «Храповики»). Импорт только в одну
// сторону: этот файл читает таблицу из routeModules.ts, а не наоборот
// (import-x/no-cycle) — саму таблицу должно быть можно прочитать, не завозя
// резолвер.
import {
  ROOT_REDIRECT_PATH,
  ROUTE_MODULES,
  segmentsOf,
  type RouteModule,
} from './routeModules';

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
 * Запись таблицы для этого адреса — чанк экрана (`.load`) и что для него
 * предзагрузить (`.prefetch`). `null` — адрес не наш (App.tsx уведёт такой
 * на главную, предзагружать нечего).
 */
export function matchRoute(pathname: string): RouteModule | null {
  const target = segmentsOf(pathname).length === 0 ? ROOT_REDIRECT_PATH : pathname;
  return (
    Object.values(ROUTE_MODULES).find((route) => matchesPattern(route.path, target)) ??
    null
  );
}
