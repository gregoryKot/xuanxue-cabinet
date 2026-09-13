// Тело PUT /attempts/:id/grading (слой 4.6, ТЗ 4.6, п.2) — баллы по
// критериям рубрики, общий комментарий, итог. Идемпотентность и проверка
// баллов против maxScore своего критерия — в ExamGradingsService.
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  GRADING_LIMITS,
  GRADING_OUTCOMES,
  type GradingCriterionInput,
  type GradingOutcome,
  type PutGradingInput,
} from '@xuanxue/shared';
import { GradingCriterionInputDto } from './grading-criterion-input.dto';

const MIN_CRITERIA = 1;

export class PutGradingDto implements PutGradingInput {
  @IsArray()
  @ArrayMinSize(MIN_CRITERIA)
  @ValidateNested({ each: true })
  @Type(() => GradingCriterionInputDto)
  criteria!: GradingCriterionInput[];

  @IsOptional()
  @IsString()
  @MaxLength(GRADING_LIMITS.comment)
  comment?: string;

  @IsIn(GRADING_OUTCOMES)
  outcome!: GradingOutcome;
}
