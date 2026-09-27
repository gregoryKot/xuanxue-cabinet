// Тело POST /exam-items. kind/prompt обязательны и не входят в
// ExamItemFieldsDto (метаданные декораторов наследуются по прототипу —
// причина у ClassFieldsDto, classes/dto/class-fields.dto.ts, та же).
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_STATUSES,
  type CreateExamItemInput,
  type ExamItemKind,
  type ExamItemStatus,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ExamItemFieldsDto } from './exam-item-fields.dto';

export class CreateExamItemDto extends ExamItemFieldsDto implements CreateExamItemInput {
  @IsIn(EXAM_ITEM_KINDS)
  kind!: ExamItemKind;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_ITEM_LIMITS.prompt)
  prompt!: string;

  // Не прислали — схема ставит `published` (ADR-0033). Явный `draft` —
  // «завожу вопрос, но пока прячу».
  @OptionalNotNull()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;
}
