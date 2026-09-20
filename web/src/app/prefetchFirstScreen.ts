// Что предзагрузить для роли и адреса — решение отдельно от «кто это запускает»
// (FirstScreenPrefetch.tsx), чтобы проверить его без React (CLAUDE.md, ревью
// «это можно протестировать без DOM?»).
import type { MeDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { putPrefetched } from '../api/prefetchCache';
import { matchRoute } from './routeMatch';
import { ROUTE_MODULES } from './routeModules';
import { canSeeRoute, isTeacher, rootPathFor } from './screenAccess';

/**
 * GET-пути, которые стоит запросить сразу после ответа `/auth/me`,
 * параллельно с чанком экрана (routeModules.ts, `prefetch` по адресу).
 */
export function firstScreenPaths(pathname: string, me: MeDto): string[] {
  // canSeeRoute — то же правило, что решает AppShell.tsx: если человек не
  // может остаться на этом адресе, он попадёт туда же, куда его отправит
  // редирект (rootPathFor), — греем данные экрана-назначения, а не
  // запрошенного.
  const target = canSeeRoute(me, pathname) ? pathname : rootPathFor(me);
  const route = matchRoute(target);
  const paths = route?.prefetch?.(target) ?? [];
  // Прогрев повторяет то, что экран реально запросит. На «Уведомлениях» штат
  // школы за формами не пойдёт: новые задания считаются только у ученика
  // (ADR-0070), и промис, который никто не заберёт, протух бы в
  // prefetchCache. На «Заданиях» формы запрашивает любая роль (TasksScreen
  // зовёт useMyExams без опций) — там прогрев остаётся для всех.
  const skipsExams = route === ROUTE_MODULES.notifications && isTeacher(me);
  const needed = skipsExams ? paths.filter((path) => path !== MY_EXAMS_PATH) : paths;

  return [...new Set(needed)];
}

/** Кладёт промис каждого пути в prefetchCache.ts — экран заберёт его при
 * монтировании (useAbortableFetch → apiFetch → takePrefetched). */
export function prefetchFirstScreen(pathname: string, me: MeDto): void {
  for (const path of firstScreenPaths(pathname, me)) {
    putPrefetched(path, apiFetch(path));
  }
}
