// Тело PATCH /exam-items/:id. `kind` сюда не входит — смена типа значит
// завести новый вопрос (ТЗ 4.2, п.1). hint/criteria — единственные поля, где
// `null` значит «сбросить»: splitUpdate (exam-items.service.ts) превращает
// его в `$unset` для NULLABLE_EXAM_ITEM_FIELDS (shared/src/exam-items.ts).
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_STATUSES,
  type ExamItemStatus,
  type UpdateExamItemInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ExamItemFieldsDto } from './exam-item-fields.dto';

export class UpdateExamItemDto extends ExamItemFieldsDto implements UpdateExamItemInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_ITEM_LIMITS.prompt)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EXAM_ITEM_LIMITS.hint)
  hint?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EXAM_ITEM_LIMITS.criteria)
  criteria?: string | null;

  @OptionalNotNull()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;
}
