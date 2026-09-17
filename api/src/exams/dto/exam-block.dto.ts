// Блок формы в теле POST/PATCH /exams — одна форма для создания и правки:
// правка blocks всегда заменяет набор целиком (в отличие от правил
// расписания у занятий, у блока своего входного признака «удалить блок»
// нет, см. exam-blocks.ts/mapBlocks). `required` из контракта убран
// (ADR-0033): пайп с `forbidNonWhitelisted` (app.setup.ts) ответит вкладке со
// старым бандлом 400, а не сохранит форму мимо смысла — e2e фиксирует это.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EXAM_LIMITS, type ExamBlockInput } from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';

export class ExamBlockDto implements ExamBlockInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(EXAM_LIMITS.blockTitle)
  title?: string;

  @IsArray()
  @ArrayMaxSize(EXAM_LIMITS.itemsPerBlockMax)
  @IsMongoId({ each: true })
  itemIds!: string[];

  @OptionalNotNull()
  @IsBoolean()
  shuffle?: boolean;
}
