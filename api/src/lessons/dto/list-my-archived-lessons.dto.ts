// Query GET /me/lessons/archive (ТЗ docs/PLAN.md §14 слой 3.3). Лимит — своя
// пара MY_ARCHIVE_LIMIT_DEFAULT/MAX (shared/src/lessons.ts), не
// MY_LESSONS_LIMIT_*: архив листается отдельно от ближайших занятий.
import { MY_ARCHIVE_LIMIT_MAX, type ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListMyArchivedLessonsDto implements ApiRouteQuery<'GET /me/lessons/archive'> {
  @ListLimit(MY_ARCHIVE_LIMIT_MAX)
  limit?: number;
}
