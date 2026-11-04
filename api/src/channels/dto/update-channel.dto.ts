// Тело PATCH /channels/:id. `groupIds: []` — «снять все группы» (ADR-0196);
// `null` не допустим нигде: у остальных полей он не имеет смысла: секрет
// не «сбрасывают» частично, меняют целиком новым `config` (SECURITY §3) —
// поэтому везде `OptionalNotNull()`, а не `@IsOptional()` (channels — в
// отличие от classes — не несёт nullable-полей вовсе, splitUpdate не нужен).
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CHANNEL_LIMITS,
  LIST_LIMIT_MAX,
  type ChannelConfig,
  type ApiRouteBody,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateChannelDto implements ApiRouteBody<'PATCH /channels/:id'> {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHANNEL_LIMITS.title)
  title?: string;

  @OptionalNotNull()
  @IsObject()
  config?: ChannelConfig;

  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(LIST_LIMIT_MAX)
  @IsMongoId({ each: true })
  groupIds?: string[];
}
