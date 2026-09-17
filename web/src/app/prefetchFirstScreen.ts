// Что предзагрузить для роли и адреса — решение отдельно от «кто это запускает»
// (FirstScreenPrefetch.tsx), чтобы проверить его без React (CLAUDE.md, ревью
// «это можно протестировать без DOM?»).
import type { MeDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH, MY_LESSONS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { putPrefetched } from '../api/prefetchCache';
import { matchRoute } from './routeMatch';
import { isPending, showsRouteScreen } from './screenAccess';

/**
 * GET-пути, которые стоит запросить сразу после ответа `/auth/me`,
 * параллельно с чанком экрана (routeModules.ts, `prefetch` по адресу).
 */
export function firstScreenPaths(pathname: string, me: MeDto): string[] {
  if (isPending(me)) return [];

  // showsRouteScreen — то же правило, что решает AppShell.tsx: тем же людям
  // на тех же адресах отдаётся Outlet маршрута, значит и первый экран — это
  // экран маршрута, а не StudentScreen.
  const paths = showsRouteScreen(me, pathname)
    ? (matchRoute(pathname)?.prefetch?.(pathname) ?? [])
    : [MY_LESSONS_PATH, MY_EXAMS_PATH];

  return [...new Set(paths)];
}

/** Кладёт промис каждого пути в prefetchCache.ts — экран заберёт его при
 * монтировании (useAbortableFetch → apiFetch → takePrefetched). */
export function prefetchFirstScreen(pathname: string, me: MeDto): void {
  for (const path of firstScreenPaths(pathname, me)) {
    putPrefetched(path, apiFetch(path));
  }
}
