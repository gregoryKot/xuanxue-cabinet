// Query GET /users — экран «Люди»: последние вошедшие, с лимитом (образец —
// ListDeliveriesDto). Фильтра по роли/статусу пока нет — список маленький
// (школа, не тысячи учеников), добавить, если понадобится.
import type { ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListUsersDto implements ApiRouteQuery<'GET /users'> {
  @ListLimit()
  limit?: number;
}
