// Адреса экранов событий школы (ADR-0177): страница создания и страница
// правки одного события. Литералы в одном месте — доска, редактор и таблица
// маршрутов (app/eventRouteModules.ts) не разойдутся.
export const NEW_EVENT_PATH = '/events/new';

export function eventEditorPath(eventId: string): string {
  return `/events/${eventId}`;
}
