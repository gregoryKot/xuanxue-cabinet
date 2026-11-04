// Тело PATCH /channels/:id. `null` допустим только у `groupId` («убрать
// группу», ADR-0195); у остальных полей он не имеет смысла: секрет
// не «сбрасывают» частично, меняют целиком новым `config` (SECURITY §3) —
// поэтому везде `OptionalNotNull()`, а не `@IsOptional()` (channels — в
// отличие от classes — не несёт nullable-полей вовсе, splitUpdate не нужен).
import {
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CHANNEL_LIMITS, type ChannelConfig, type ApiRouteBody } from '@xuanxue/shared';
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

  @IsOptional()
  @IsMongoId()
  groupId?: string | null;
}
