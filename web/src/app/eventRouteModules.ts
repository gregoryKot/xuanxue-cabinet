// Экраны события школы (ADR-0177) — часть ROUTE_MODULES (routeModules.ts),
// вынесены отдельным файлом по той же причине, что studentRouteModules.ts:
// в самой таблице уже за четыреста строк, а храповик размера
// (check-file-size-ratchet) не даёт ей расти. В ROUTE_MODULES блок попадает
// спредом, `matchRoute` и `<Route>` разницы не видят. Порядок записей важен:
// `/events/new` раньше `/events/:eventId`, статический сегмент выигрывает у
// параметра.
//
// Маршруты штатные: canSeeRoute (screenAccess.ts) закрывает их ученику, а API
// закрыт ролью контроллера. Обе записи грузят список событий — у правки по
// нему находится событие (events/useEventEditor.ts), новому читать нечего.
import { SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import type { RouteModule } from './routeModules';

const loadEventEditor = () => import('../events/EventEditorScreen');

export const EVENT_ROUTE_MODULES = {
  eventNew: { path: '/events/new', load: loadEventEditor, warm: true },
  eventEditor: {
    path: '/events/:eventId',
    load: loadEventEditor,
    warm: true,
    prefetch: () => [SCHOOL_EVENTS_PATH],
  },
} satisfies Record<string, RouteModule>;
