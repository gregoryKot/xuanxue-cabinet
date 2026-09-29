// Пути экрана тега (ADR-0075/0078) — отдельный файл, не apiPaths.ts: тот уже
// стоит на зафиксированном потолке храповика размера
// (scripts/file-size-baseline.json), и добавлять сюда ещё один повод для
// --update незачем, когда новый путь и так тематически отделим — тот же
// приём, что у routeMatch.ts, вынесенного из routeModules.ts по той же
// причине (CLAUDE.md «Храповики»: «раздутый файл дробится, а не пухнет
// дальше»). Даты занятий с тегом (`GET /lessons?tag=`) — без окна, выдача по
// тегу не ограничена горизонтом планирования (ADR-0078): хук экрана тега
// зовёт карту с одним `tag` (materials/useLessonsByTag.ts).
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { apiRoutePath } from './apiRoute';

/** Сводка тегов школы (экран тега) — весь список, не первая страница
 * фильтра: тот же приём, что у CLASSES_LIST_PATH (apiPaths.ts). */
export const TAGS_LIST_QUERY = { limit: LIST_LIMIT_MAX };
/** Строка пути — для таблицы предзагрузки: ключ кэша prefetchCache.ts должен
 * совпасть с тем, что соберёт `apiRoute` (PLAN §17.1). */
export const TAGS_LIST_PATH = apiRoutePath('GET /tags', { query: TAGS_LIST_QUERY });
