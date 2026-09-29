// Query GET /exam-items. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_STATUSES,
  type ExamItemKind,
  type ApiRouteQuery,
  type ExamItemStatus,
} from '@xuanxue/shared';
import { booleanFromQuery } from '../../common/query-transforms';
import { ListLimit } from '../../common/validation';

export class ListExamItemsDto implements ApiRouteQuery<'GET /exam-items'> {
  @IsOptional()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;

  @IsOptional()
  @IsIn(EXAM_ITEM_KINDS)
  kind?: ExamItemKind;

  @ListLimit()
  limit?: number;

  // Мягко удалённые вопросы (ADR-0140) — редактору формы, не экрану банка.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => booleanFromQuery(value))
  @IsBoolean()
  includeDeleted?: boolean;
}
