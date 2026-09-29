// Тело PATCH /exam-items/:id. `kind` сюда не входит — смена типа значит
// завести новый вопрос (ТЗ 4.2, п.1). `videoId`/`videoUrl` — единственные
// nullable-поля вопроса (NULLABLE_EXAM_ITEM_FIELDS, ADR-0133): `@IsOptional()`
// пропускает и `undefined`, и `null` — на `null` `@IsMongoId()`/`@IsUrl()`
// ниже уже не запускаются (тот же приём, что zoomLink у занятий,
// classes/dto/update-class.dto.ts).
import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_STATUSES,
  type ExamItemStatus,
  type ApiRouteBody,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ExamItemFieldsDto } from './exam-item-fields.dto';

export class UpdateExamItemDto
  extends ExamItemFieldsDto
  implements ApiRouteBody<'PATCH /exam-items/:id'>
{
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_ITEM_LIMITS.prompt)
  prompt?: string;

  @IsOptional()
  @IsMongoId()
  videoId?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(EXAM_ITEM_LIMITS.videoUrl)
  videoUrl?: string | null;

  @OptionalNotNull()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;
}
