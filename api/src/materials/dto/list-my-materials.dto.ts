// Query GET /me/materials (слой 3.1). Лимит по умолчанию
// MY_MATERIALS_LIMIT_DEFAULT, максимум MY_MATERIALS_LIMIT_MAX — своя пара,
// тот же приём, что у ListMyLessonsDto (shared/src/lessons.ts).
import { MY_MATERIALS_LIMIT_MAX, type ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListMyMaterialsDto implements ApiRouteQuery<'GET /me/materials'> {
  @ListLimit(MY_MATERIALS_LIMIT_MAX)
  limit?: number;
}
