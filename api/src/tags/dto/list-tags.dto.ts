// Query GET /tags — только лимит: без окна и без фильтра по тегу (сводка
// считается по всей истории школы разом, ADR-0078).
import type { ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListTagsDto implements ApiRouteQuery<'GET /tags'> {
  @ListLimit()
  limit?: number;
}
