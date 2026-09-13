// Query GET /me/lessons (ТЗ docs/PLAN.md §11). Лимит по умолчанию
// MY_LESSONS_LIMIT_DEFAULT (10), максимум MY_LESSONS_LIMIT_MAX (50) — своя
// пара, короче общей LIST_LIMIT_DEFAULT/MAX (shared/src/lessons.ts):
// экрану ученика короткий список, не окно планирования учителя.
import { MY_LESSONS_LIMIT_MAX, type ListMyLessonsQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListMyLessonsDto implements ListMyLessonsQuery {
  @ListLimit(MY_LESSONS_LIMIT_MAX)
  limit?: number;
}
