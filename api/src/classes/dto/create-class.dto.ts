// Тело POST /classes. title/format обязательны (в отличие от PATCH, где они
// не входят в тело, если не меняются) — оба объявлены здесь, не в
// ClassFieldsDto (см. комментарий там про наследование метаданных).
// `null` при создании не имеет смысла ни для одного поля (сбрасывать нечего),
// поэтому везде OptionalNotNull, а не @IsOptional().
import { IsIn, IsMongoId, IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import {
  CLASS_FORMATS,
  CLASS_LIMITS,
  type ClassFormat,
  type CreateClassInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ClassFieldsDto } from './class-fields.dto';

export class CreateClassDto extends ClassFieldsDto implements CreateClassInput {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLASS_LIMITS.title)
  title!: string;

  @IsIn(CLASS_FORMATS)
  format!: ClassFormat;

  @OptionalNotNull()
  @IsString()
  @MaxLength(CLASS_LIMITS.location)
  location?: string;

  @OptionalNotNull()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(CLASS_LIMITS.zoomLink)
  zoomLink?: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(CLASS_LIMITS.zoomPassword)
  zoomPassword?: string;

  @OptionalNotNull()
  @IsMongoId()
  leaderId?: string;
}
