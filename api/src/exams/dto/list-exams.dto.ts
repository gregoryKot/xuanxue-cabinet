// Query GET /exams. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EXAM_LIMITS,
  EXAM_STATUSES,
  type ExamStatus,
  type ListExamsQuery,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListExamsDto implements ListExamsQuery {
  @IsOptional()
  @IsIn(EXAM_STATUSES)
  status?: ExamStatus;

  @IsOptional()
  @IsString()
  @MaxLength(EXAM_LIMITS.level)
  level?: string;

  @ListLimit()
  limit?: number;
}
