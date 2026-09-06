// DTO, константы и типы конфигов API каналов (`/channels`). Общий контракт
// api и web (CLAUDE.md, раздел «Слои»): DTO в api объявляется как
// `implements` этих типов, расхождение ловит tsc.
import type { ChannelType } from './domain';

/** `chatId` — `@username` канала или `-100…` для группы/супергруппы: бот
 * должен быть добавлен администратором заранее (PLAN §6, экран «Каналы»). */
export interface TelegramChannelConfig {
  chatId: string;
}

/** Токен сообщества ВК (не пользовательский — `video.save` со scope `video`
 * им не вызвать, см. `api/src/channels/vk.adapter.ts`) и id беседы, куда
 * добавлен бот сообщества. */
export interface VkChannelConfig {
  token: string;
  peerId: number;
}

/** Facebook, Boosty — доставку завершает человек кнопкой «скопировал,
 * отправил» (PLAN §6), секретов не требует. */
export type ManualChannelConfig = Record<string, never>;

export type ChannelConfig = TelegramChannelConfig | VkChannelConfig | ManualChannelConfig;

/** `chatId` в объекте — единственный признак, различающий три формы
 * `ChannelConfig` (ни один из них не несёт свой `type`, см. `channel.mapper.ts`
 * и адаптеры — используют этот guard, а не дублируют проверку). */
export function isTelegramChannelConfig(
  config: ChannelConfig,
): config is TelegramChannelConfig {
  return 'chatId' in config;
}

export function isVkChannelConfig(config: ChannelConfig): config is VkChannelConfig {
  return 'peerId' in config;
}

export interface ChannelDto {
  id: string;
  type: ChannelType;
  title: string;
  active: boolean;
  /** Что показать учителю без секрета: `chatId`/`peerId`/`''` — `config`
   * целиком в DTO не входит никогда (SECURITY §3). */
  target: string;
  createdAt: string;
  updatedAt: string;
}

/** `webpush` создаётся своей подпиской (`push_subscriptions`), не этим
 * эндпоинтом — исключён из типов входа. */
export interface CreateChannelInput {
  type: Exclude<ChannelType, 'webpush'>;
  title: string;
  config: ChannelConfig;
}

/** `config` заменяется целиком, частичный патч секрета не предусмотрен
 * (SECURITY §3: `config` write-only, сравнивать старое/новое значение
 * эндпоинту незачем). `null` нигде не допускается — ни у одного поля канала
 * нет смысла «сбросить». */
export interface UpdateChannelInput {
  title?: string;
  active?: boolean;
  config?: ChannelConfig;
}

export interface ChannelTestResult {
  status: 'sent' | 'manual' | 'failed';
  /** Уже без токена/пароля — прошёл `scrubChannelSecrets` (SECURITY §6). */
  error?: string;
}

export interface ListChannelsQuery {
  active?: boolean;
  limit?: number;
}

export const CHANNEL_LIMITS = {
  title: 80,
  chatId: 64,
  token: 256,
} as const;

export const CHANNEL_NOT_FOUND_MESSAGE = 'Канал не найден. Обновите список.';
