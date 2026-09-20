// Query GET /tags — только лимит: без окна и без фильтра по тегу (сводка
// считается по всей истории школы разом, ADR-0074).
import type { ListTagsQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListTagsDto implements ListTagsQuery {
  @ListLimit()
  limit?: number;
}
