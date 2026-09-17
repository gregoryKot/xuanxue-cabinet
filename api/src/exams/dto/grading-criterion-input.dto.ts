// Критерий в теле PUT /attempts/:id/grading — только баллы и комментарий по
// `id` критерия рубрики. `title`/`maxScore` сервис берёт из текущей рубрики
// экзамена (buildGradingCriteria, exam-grading-criteria.ts), не из запроса.
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GRADING_LIMITS, type GradingCriterionInput } from '@xuanxue/shared';

// Верхняя граница здесь — не про конкретный критерий (её проверяет сервис
// против maxScore рубрики), а защита формы запроса от абсурдных чисел.
const MAX_SCORE_FIELD_CEILING = 1000;
const MIN_SCORE = 0;

export class GradingCriterionInputDto implements GradingCriterionInput {
  @IsMongoId()
  id!: string;

  @IsInt()
  @Min(MIN_SCORE)
  @Max(MAX_SCORE_FIELD_CEILING)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(GRADING_LIMITS.criterionComment)
  comment?: string;
}
