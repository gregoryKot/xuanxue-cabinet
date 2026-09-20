// Пути экрана тега (ADR-0075/0078) — отдельный файл, не apiPaths.ts: тот уже
// стоит на зафиксированном потолке храповика размера (152 строки из 150,
// scripts/file-size-baseline.json), и добавлять сюда ещё один повод для
// --update незачем, когда новый путь и так тематически отделим — тот же
// приём, что у routeMatch.ts, вынесенного из routeModules.ts по той же
// причине (CLAUDE.md «Храповики»: «раздутый файл дробится, а не пухнет
// дальше»).
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { LESSONS_PATH } from './apiPaths';

// Не экспортирован — снаружи нужен только TAGS_LIST_PATH целиком (knip иначе
// ловит TAGS_PATH как неиспользуемый экспорт).
const TAGS_PATH = '/tags';
/** Сводка тегов школы (экран тега) — весь список, не первая страница
 * фильтра: тот же приём, что у CLASSES_LIST_PATH (apiPaths.ts). */
export const TAGS_LIST_PATH = `${TAGS_PATH}?limit=${LIST_LIMIT_MAX}`;

/**
 * Даты занятий с тегом — без окна `from`/`to`: выдача по тегу не ограничена
 * горизонтом планирования (ADR-0078), сервер сам берёт лимит по умолчанию
 * (50) и сортировку «от свежих» без окна. Экран тега — единственный
 * потребитель; lessonsListPath (apiPaths.ts) с окном остаётся для
 * «Планирования».
 */
export function lessonsByTagPath(tag: string): string {
  return `${LESSONS_PATH}?tag=${encodeURIComponent(tag)}`;
}
