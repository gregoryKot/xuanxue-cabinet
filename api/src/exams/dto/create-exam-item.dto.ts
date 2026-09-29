// Тело POST /exam-items. kind/prompt обязательны и не входят в
// ExamItemFieldsDto (метаданные декораторов наследуются по прототипу —
// причина у ClassFieldsDto, classes/dto/class-fields.dto.ts, та же).
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
  EXAM_ITEM_KINDS,
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_STATUSES,
  type ApiRouteBody,
  type ExamItemKind,
  type ExamItemStatus,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ExamItemFieldsDto } from './exam-item-fields.dto';

export class CreateExamItemDto
  extends ExamItemFieldsDto
  implements ApiRouteBody<'POST /exam-items'>
{
  @IsIn(EXAM_ITEM_KINDS)
  kind!: ExamItemKind;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXAM_ITEM_LIMITS.prompt)
  prompt!: string;

  // Видео к формулировке вопроса (ADR-0133) — ссылка на уже загруженную
  // запись exam_videos (`POST /exam-videos`), не сами байты. Сочетание с
  // videoUrl — сервис (ExamItemsService.assertOneVideoSource).
  @IsOptional()
  @IsMongoId()
  videoId?: string;

  // https-ссылка на видео вопроса (YouTube и т.п., без R2) — тот же
  // валидатор, что у ссылки записи/материала.
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(EXAM_ITEM_LIMITS.videoUrl)
  videoUrl?: string;

  // Не прислали — схема ставит `published` (ADR-0033). Явный `draft` —
  // «завожу вопрос, но пока прячу».
  @OptionalNotNull()
  @IsIn(EXAM_ITEM_STATUSES)
  status?: ExamItemStatus;
}
