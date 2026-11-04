// Тело POST /channels. `config` — форма зависит от `type` (три разных
// интерфейса без общего дискриминанта, shared/src/channels.ts), декларативно
// проверить такую вложенность декораторами `class-validator` вышло бы
// длиннее и дальше от текста ошибки, чем явная проверка. Здесь — только
// базовая форма (`@IsObject()`), развёрнутая проверка полей по `type` —
// `assertConfigForType` в channels.service.ts.
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CHANNEL_LIMITS,
  CHANNEL_TYPES,
  LIST_LIMIT_MAX,
  type ChannelConfig,
  type ChannelType,
  type ApiRouteBody,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class CreateChannelDto implements ApiRouteBody<'POST /channels'> {
  @IsIn(CHANNEL_TYPES)
  type!: ChannelType;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHANNEL_LIMITS.title)
  title!: string;

  @IsObject()
  config!: ChannelConfig;

  // Группы школы (ADR-0196); существование id проверяет ChannelsService.
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(LIST_LIMIT_MAX)
  @IsMongoId({ each: true })
  groupIds?: string[];
}
