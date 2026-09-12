// Вариант ответа в теле POST/PATCH /exam-items — одна форма для создания и
// правки: правка options всегда заменяет набор целиком (в отличие от правил
// расписания у занятий, у варианта своего входного `id` нет, см.
// exam-item-options.ts/mapOptions).
import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EXAM_ITEM_LIMITS, type ExamItemOptionInput } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class ExamItemOptionDto implements ExamItemOptionInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_ITEM_LIMITS.optionText)
  text!: string;

  @IsOptional()
  @IsBoolean()
  correct?: boolean;
}
