// Query GET /exams. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EXAM_LIMITS,
  EXAM_STATUSES,
  type ApiRouteQuery,
  type ExamStatus,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListExamsDto implements ApiRouteQuery<'GET /exams'> {
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
