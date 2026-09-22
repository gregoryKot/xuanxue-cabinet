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
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CHANNEL_LIMITS,
  CHANNEL_TYPES,
  TAG_LIMITS,
  type ChannelConfig,
  type ChannelType,
  type CreateChannelInput,
} from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class CreateChannelDto implements CreateChannelInput {
  @IsIn(CHANNEL_TYPES)
  type!: ChannelType;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHANNEL_LIMITS.title)
  title!: string;

  @IsObject()
  config!: ChannelConfig;

  // Отбор рассылок по тегу (ADR-0108) — нормализация (обрезка, дедуп без
  // учёта регистра), только если поле прислали, ChannelsService (тот же
  // приём, что у CreateLessonDto.tags).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAG_LIMITS.perRecord)
  @IsString({ each: true })
  @MaxLength(TAG_LIMITS.length, { each: true })
  tags?: string[];
}
