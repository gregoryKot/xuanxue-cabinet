// Query GET /exam-items. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_STATUSES,
  type ExamItemKind,
  type ExamItemStatus,
  type ListExamItemsQuery,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListExamItemsDto implements ListExamItemsQuery {
  @IsOptional()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;

  @IsOptional()
  @IsIn(EXAM_ITEM_KINDS)
  kind?: ExamItemKind;

  @IsOptional()
  @IsString()
  @MaxLength(EXAM_ITEM_LIMITS.tag)
  tag?: string;

  @ListLimit()
  limit?: number;
}
