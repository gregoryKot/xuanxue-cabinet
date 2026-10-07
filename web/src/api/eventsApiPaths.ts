// Пути событий школы (ADR-0177) — отдельным файлом, не apiPaths.ts: тот
// стоит на потолке храповика размера (тот же приём, что boardApiPaths.ts).
// Запросы идут через карту маршрутов (events/useSchoolEvents.ts,
// board/useMyEvents.ts); строки нужны предзагрузке первого экрана
// (studentRouteModules.ts, routeModules.ts): ключ кэша prefetchCache.ts
// должен совпасть с запросом хука.
import { apiRoutePath } from './apiRoute';

/** Список штата: все события, от поздних к ранним, без query — лимит по умолчанию. */
export const SCHOOL_EVENTS_PATH = apiRoutePath('GET /events');
/** Предстоящие и идущие события для доски любой роли. */
export const MY_EVENTS_PATH = apiRoutePath('GET /me/events');
