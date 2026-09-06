// Тело PATCH /classes/:id. title/format необязательны (в отличие от POST), но
// не nullable — `OptionalNotNull()` пропускает только `undefined`, `null`
// доходит до `@IsString()`/`@IsIn()` и получает 400.
// location/zoomLink/zoomPassword/leaderId — единственные поля, где `null`
// значит «сбросить»: `splitUpdate` (classes.update.ts) превращает его в
// `$unset` для NULLABLE_CLASS_FIELDS (shared/src/classes.ts). `@IsOptional()`
// здесь пропускает и `undefined`, и `null` — на `null` `@IsString()`/
// `@IsUrl()`/`@IsMongoId()` ниже уже не запускаются.
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
  CLASS_FORMATS,
  CLASS_LIMITS,
  type ClassFormat,
  type UpdateClassInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';
import { ClassFieldsDto } from './class-fields.dto';

export class UpdateClassDto extends ClassFieldsDto implements UpdateClassInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLASS_LIMITS.title)
  title?: string;

  @OptionalNotNull()
  @IsIn(CLASS_FORMATS)
  format?: ClassFormat;

  @IsOptional()
  @IsString()
  @MaxLength(CLASS_LIMITS.location)
  location?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(CLASS_LIMITS.zoomLink)
  zoomLink?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(CLASS_LIMITS.zoomPassword)
  zoomPassword?: string | null;

  @IsOptional()
  @IsMongoId()
  leaderId?: string | null;
}
