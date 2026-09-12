// Поля, общие для тела POST и PATCH /exams (создание и правка одной формой) —
// blocks/attemptsAllowed не меняют ни обязательность, ни тип между create и
// update (в отличие от title/description/level/timeLimitMin/status), поэтому
// декораторы не дублируются (метаданные class-validator наследуются по
// прототипу — тот же приём, что у ExamItemFieldsDto/ClassFieldsDto).
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { EXAM_LIMITS, type ExamBlockInput } from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';
import { ExamBlockDto } from './exam-block.dto';

const MIN_ATTEMPTS_ALLOWED = 1;

export class ExamFieldsDto {
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(EXAM_LIMITS.blocksMax)
  @ValidateNested({ each: true })
  @Type(() => ExamBlockDto)
  blocks?: ExamBlockInput[];

  @OptionalNotNull()
  @IsInt()
  @Min(MIN_ATTEMPTS_ALLOWED)
  @Max(EXAM_LIMITS.attemptsMax)
  attemptsAllowed?: number;
}
