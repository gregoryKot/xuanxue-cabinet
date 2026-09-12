// Query GET /me/exams (ТЗ student-api.md). Лимит по умолчанию
// LIST_LIMIT_DEFAULT, максимум LIST_LIMIT_MAX — «дай всё» запрещён
// (CLAUDE.md, раздел «API»); ТЗ не называет своей пары, как у /me/lessons,
// поэтому общая — как у /exams.
import type { ListMyExamsQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListMyExamsDto implements ListMyExamsQuery {
  @ListLimit()
  limit?: number;
}
