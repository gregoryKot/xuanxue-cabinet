// Резолвер маршрута по адресу — вынесен из routeModules.ts (файл-храповик:
// после таблицы `prefetch` строк стало больше, чем «весит» само сопоставление
// пути с записью таблицы, CLAUDE.md «Храповики»). Импорт только в одну
// сторону: этот файл читает таблицу из routeModules.ts, а не наоборот
// (import-x/no-cycle) — саму таблицу должно быть можно прочитать, не завозя
// резолвер.
import { ROUTE_MODULES, segmentsOf, type RouteModule } from './routeModules';
import { STAFF_ROOT_PATH } from './screenAccess';

// Роль ушла из ROOT_REDIRECT_PATH в rootPathFor (screenAccess.ts) — этот
// резолвер по-прежнему без роли, ему нужен только один опорный путь для
// «/» (сегментов нет). Импорт STAFF_ROOT_PATH, а не второй литерал: свой
// литерал здесь и в screenAccess.ts разъехались бы при следующей правке
// корня штата, и prefetchFirstScreen.ts (matchRoute('/') — canSeeRoute(штат,
// '/') истинна) грел бы данные не того экрана (ADR-0138).
const EMPTY_PATH_FALLBACK = STAFF_ROOT_PATH;

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
  const target = segmentsOf(pathname).length === 0 ? EMPTY_PATH_FALLBACK : pathname;
  return (
    Object.values(ROUTE_MODULES).find((route) => matchesPattern(route.path, target)) ??
    null
  );
}
