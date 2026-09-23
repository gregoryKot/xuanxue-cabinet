// Тело PATCH /exam-items/:id. `kind` сюда не входит — смена типа значит
// завести новый вопрос (ТЗ 4.2, п.1).
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
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

  @OptionalNotNull()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;
}
