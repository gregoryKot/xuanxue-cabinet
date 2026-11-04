// Query GET /channels. Тот же декоратор лимита, что у /classes и /lessons
// (CLAUDE.md «одна механика — один компонент»); «дай всё» запрещён.
import type { ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListChannelsDto implements ApiRouteQuery<'GET /channels'> {
  @ListLimit()
  limit?: number;
}
