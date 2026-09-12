// Тело POST /exams. title обязателен и не входит в ExamFieldsDto (метаданные
// декораторов наследуются по прототипу — причина у ExamItemFieldsDto,
// exam-item-fields.dto.ts, та же). `status` сюда не входит — новая форма
// всегда создаётся черновиком (схема, ExamRecord.status default).
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { EXAM_LIMITS, type CreateExamInput } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ExamFieldsDto } from './exam-fields.dto';

const MIN_TIME_LIMIT_MIN = 1;

export class CreateExamDto extends ExamFieldsDto implements CreateExamInput {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_LIMITS.title)
  title!: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(EXAM_LIMITS.description)
  description?: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(EXAM_LIMITS.level)
  level?: string;

  @OptionalNotNull()
  @IsInt()
  @Min(MIN_TIME_LIMIT_MIN)
  @Max(EXAM_LIMITS.timeLimitMinMax)
  timeLimitMin?: number;
}
