// Query GET /grading-presets. Тот же декоратор лимита, что у /channels и
// /classes (CLAUDE.md «одна механика — один компонент»); «дай всё» запрещён.
import type { ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListGradingCommentPresetsDto implements ApiRouteQuery<'GET /grading-presets'> {
  @ListLimit()
  limit?: number;
}
