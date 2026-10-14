// Экраны общей с wiki сессии (ADR-0183) — часть ROUTE_MODULES (routeModules.ts),
// вынесены отдельным файлом по той же причине, что eventRouteModules.ts: в
// самой таблице уже за четыреста строк, а храповик размера не даёт ей расти.
//
// Оба публичные, как login: не требуют сессии, вошедшему чанк не нужен заранее
// (`warm: false`). `/wiki` — мост к серверному адресу входа из wiki
// (auth/WikiResumeScreen.tsx), `/logout` — страница с кнопкой выхода, на неё
// ведёт ссылка из wiki (auth/LogoutScreen.tsx).
import { WIKI_ENTRY_PATH } from '@xuanxue/shared';
import type { RouteModule } from './routeModules';

export const WIKI_SESSION_ROUTE_MODULES = {
  wikiResume: {
    path: WIKI_ENTRY_PATH,
    load: () => import('../auth/WikiResumeScreen'),
    warm: false,
  },
  logout: {
    path: '/logout',
    load: () => import('../auth/LogoutScreen'),
    warm: false,
  },
} satisfies Record<string, RouteModule>;
