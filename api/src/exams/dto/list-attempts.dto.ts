// Query GET /attempts. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import {
  EXAM_ATTEMPT_STATUSES,
  type ExamAttemptStatus,
  type ApiRouteQuery,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListAttemptsDto implements ApiRouteQuery<'GET /attempts'> {
  @IsOptional()
  @IsMongoId()
  examId?: string;

  @IsOptional()
  @IsIn(EXAM_ATTEMPT_STATUSES)
  status?: ExamAttemptStatus;

  @ListLimit()
  limit?: number;
}
