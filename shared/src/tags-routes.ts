// Записи карты маршрутов (api-routes.ts, ADR-0148) — сводка тегов школы
// (ADR-0075): подсказка тегов в формах и пилюли фильтра «Материалов».
import type { ListTagsQuery, TagSummaryDto } from './tags';

export interface TagsRoutes {
  'GET /tags': { query: ListTagsQuery; body: undefined; response: TagSummaryDto[] };
}

export const TAGS_ROUTE_KEYS: Record<keyof TagsRoutes, true> = {
  'GET /tags': true,
};
