// Критерий рубрики в теле POST/PATCH /exams — одна форма для создания и
// правки: правка `rubric` всегда заменяет набор целиком (тот же приём, что
// у блока формы, exam-block.dto.ts), у критерия своего входного признака
// «удалить» нет.
import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EXAM_LIMITS, type RubricCriterionInput } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

const MIN_MAX_SCORE = 1;

export class RubricCriterionDto implements RubricCriterionInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_LIMITS.rubricCriterionTitle)
  title!: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(EXAM_LIMITS.rubricCriterionDescription)
  description?: string;

  @IsInt()
  @Min(MIN_MAX_SCORE)
  @Max(EXAM_LIMITS.rubricMaxScoreMax)
  maxScore!: number;
}
