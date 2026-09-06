// Тело POST /channels. `config` — форма зависит от `type` (три разных
// интерфейса без общего дискриминанта, shared/src/channels.ts), декларативно
// проверить такую вложенность декораторами `class-validator` вышло бы
// длиннее и дальше от текста ошибки, чем явная проверка. Здесь — только
// базовая форма (`@IsObject()`), развёрнутая проверка полей по `type` —
// `assertConfigForType` в channels.service.ts.
import { IsIn, IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';
import {
  CHANNEL_LIMITS,
  CHANNEL_TYPES,
  type ChannelConfig,
  type ChannelType,
  type CreateChannelInput,
} from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

type CreatableChannelType = Exclude<ChannelType, 'webpush'>;
const CREATABLE_CHANNEL_TYPES = CHANNEL_TYPES.filter(
  (type): type is CreatableChannelType => type !== 'webpush',
);

export class CreateChannelDto implements CreateChannelInput {
  @IsIn(CREATABLE_CHANNEL_TYPES)
  type!: CreatableChannelType;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHANNEL_LIMITS.title)
  title!: string;

  @IsObject()
  config!: ChannelConfig;
}
