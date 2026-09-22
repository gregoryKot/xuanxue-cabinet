// Тело PATCH /channels/:id. Ни у одного поля `null` не имеет смысла: секрет
// не «сбрасывают» частично, меняют целиком новым `config` (SECURITY §3) —
// поэтому везде `OptionalNotNull()`, а не `@IsOptional()` (channels — в
// отличие от classes — не несёт nullable-полей вовсе, splitUpdate не нужен).
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CHANNEL_LIMITS,
  TAG_LIMITS,
  type ChannelConfig,
  type UpdateChannelInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateChannelDto implements UpdateChannelInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHANNEL_LIMITS.title)
  title?: string;

  @OptionalNotNull()
  @IsBoolean()
  active?: boolean;

  @OptionalNotNull()
  @IsObject()
  config?: ChannelConfig;

  // Как и остальные поля выше: `null` тегам тоже не нужен — сброс тегов
  // делают пустым массивом `[]`, не `null` (ChannelsService нормализует,
  // только если поле прислали, — тот же приём, что у ClassesService.update).
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(TAG_LIMITS.perRecord)
  @IsString({ each: true })
  @MaxLength(TAG_LIMITS.length, { each: true })
  tags?: string[];
}
