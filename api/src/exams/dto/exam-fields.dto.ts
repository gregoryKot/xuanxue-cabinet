// Поля, общие для тела POST и PATCH /exams (создание и правка одной формой) —
// blocks/shuffleOptions/attemptsAllowed не меняют ни обязательность, ни тип между create и
// update (в отличие от title/description/level/timeLimitMin/status), поэтому
// декораторы не дублируются (метаданные class-validator наследуются по
// прототипу — тот же приём, что у ExamItemFieldsDto/ClassFieldsDto).
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
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

  // Перемешивать варианты ответа внутри вопроса (ADR-0033) — у формы, а не
  // у блока: вариантами экзамен распоряжается одинаково везде.
  @OptionalNotNull()
  @IsBoolean()
  shuffleOptions?: boolean;

  @OptionalNotNull()
  @IsInt()
  @Min(MIN_ATTEMPTS_ALLOWED)
  @Max(EXAM_LIMITS.attemptsMax)
  attemptsAllowed?: number;
}
