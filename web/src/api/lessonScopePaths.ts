// Пути про занятия в уведомлениях — отдельный файл, не apiPaths.ts: тот стоит
// на зафиксированном потолке храповика размера (scripts/file-size-baseline.json),
// тот же приём, что у tagsApiPaths.ts. Строки нужны таблице предзагрузки: ключ
// кэша prefetchCache.ts должен совпасть с тем, что соберёт `apiRoute` (PLAN §17.1).
import { apiRoutePath } from './apiRoute';

/** Снимок настроек напоминаний: экран настроек (useReminderSync.ts) и подсказка
 * в ленте (LessonScopeHint.tsx), ADR-0185. */
export const REMINDER_SYNC_PATH = apiRoutePath('GET /me/notifications/lessons/sync');
