// Тело PATCH /exams/:id. description/level/timeLimitMin — единственные поля,
// где `null` значит «сбросить»: splitUpdate (exams.service.ts) превращает
// его в `$unset` для NULLABLE_EXAM_FIELDS (shared/src/exams.ts). `status` —
// переход в `published` сервис проверяет по правилам ТЗ 4.3, п.1–2.
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EXAM_LIMITS,
  EXAM_STATUSES,
  type ExamStatus,
  type UpdateExamInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ExamFieldsDto } from './exam-fields.dto';

const MIN_TIME_LIMIT_MIN = 1;

export class UpdateExamDto extends ExamFieldsDto implements UpdateExamInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_LIMITS.title)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EXAM_LIMITS.description)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EXAM_LIMITS.level)
  level?: string | null;

  @IsOptional()
  @IsInt()
  @Min(MIN_TIME_LIMIT_MIN)
  @Max(EXAM_LIMITS.timeLimitMinMax)
  timeLimitMin?: number | null;

  // `null` — сброс (dueAt входит в NULLABLE_EXAM_FIELDS, shared/src/exams.ts),
  // тот же приём, что у timeLimitMin выше.
  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string | null;

  @OptionalNotNull()
  @IsIn(EXAM_STATUSES)
  status?: ExamStatus;
}
