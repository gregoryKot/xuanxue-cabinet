// Путь «о каких занятиях напоминать» (ADR-0162) — отдельный файл, не
// apiPaths.ts: тот стоит на зафиксированном потолке храповика размера
// (scripts/file-size-baseline.json), тот же приём, что у tagsApiPaths.ts.
import { apiRoutePath } from './apiRoute';

/** Строка пути — для таблицы предзагрузки: ключ кэша prefetchCache.ts должен
 * совпасть с тем, что соберёт `apiRoute` в useLessonScope.ts (PLAN §17.1). */
export const MY_LESSON_NOTIFICATIONS_PATH = apiRoutePath('GET /me/notifications/lessons');
