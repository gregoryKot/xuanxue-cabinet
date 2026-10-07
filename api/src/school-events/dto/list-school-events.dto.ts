// Query GET /events: тот же декоратор лимита, что у остальных списков;
// «дай всё» запрещён.
import type { ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListSchoolEventsDto implements ApiRouteQuery<'GET /events'> {
  @ListLimit()
  limit?: number;
}
