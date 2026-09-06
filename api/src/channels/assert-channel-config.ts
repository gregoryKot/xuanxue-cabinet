// Проверка формы `config` по типу канала — три интерфейса без общего
// дискриминанта (shared/src/channels.ts), декларативно через class-validator
// вышло бы длиннее и дальше от текста ошибки, поэтому явная функция,
// отдельная от сервиса ради размера файла (CLAUDE.md «Файлы»).
import {
  isTelegramChannelConfig,
  isVkChannelConfig,
  CHANNEL_LIMITS,
} from '@xuanxue/shared';
import type { ChannelConfig, ChannelType } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

const CHATID_MESSAGE = 'Укажите chatId канала — «@имя_канала» или «-100…» для группы.';
const CHATID_LENGTH_MESSAGE = `chatId длиннее ${CHANNEL_LIMITS.chatId} символов.`;
const VK_MESSAGE = 'Укажите токен сообщества и id беседы ВК.';
const VK_TOKEN_LENGTH_MESSAGE = `Токен ВК длиннее ${CHANNEL_LIMITS.token} символов.`;
const MANUAL_MESSAGE = 'У ручного канала нет полей config.';
const WEBPUSH_MESSAGE = 'Канал webpush подключается через подписку, не этим экраном.';
const TELEGRAM_KEYS = ['chatId'];
const VK_KEYS = ['token', 'peerId'];

export function assertConfigForType(type: ChannelType, config: ChannelConfig): void {
  switch (type) {
    case 'telegram':
      assertTelegramConfig(config);
      return;
    case 'vk':
      assertVkConfig(config);
      return;
    case 'manual':
      if (Object.keys(config).length > 0) throw new InvalidInputError(MANUAL_MESSAGE);
      return;
    case 'webpush':
      throw new InvalidInputError(WEBPUSH_MESSAGE);
  }
}

function assertTelegramConfig(config: ChannelConfig): void {
  if (!isTelegramChannelConfig(config) || !config.chatId.trim()) {
    throw new InvalidInputError(CHATID_MESSAGE);
  }
  if (config.chatId.length > CHANNEL_LIMITS.chatId) {
    throw new InvalidInputError(CHATID_LENGTH_MESSAGE);
  }
  assertNoExtraFields(config, TELEGRAM_KEYS);
}

function assertVkConfig(config: ChannelConfig): void {
  if (
    !isVkChannelConfig(config) ||
    !config.token.trim() ||
    !Number.isInteger(config.peerId)
  ) {
    throw new InvalidInputError(VK_MESSAGE);
  }
  if (config.token.length > CHANNEL_LIMITS.token) {
    throw new InvalidInputError(VK_TOKEN_LENGTH_MESSAGE);
  }
  assertNoExtraFields(config, VK_KEYS);
}

// Лишнее поле в config — не опечатка формы (whitelist ValidationPipe до сюда
// не достаёт: `config` типизирован общим ChannelConfig, не своим DTO) — скорее
// вставленный чужой конфиг или устаревший клиент; явная ошибка лучше тихого
// игнорирования лишних данных.
function assertNoExtraFields(config: ChannelConfig, allowedKeys: string[]): void {
  const extra = Object.keys(config).filter((key) => !allowedKeys.includes(key));
  if (extra.length === 0) return;
  throw new InvalidInputError(
    `Лишние поля в настройках канала: ${extra.join(', ')}. Уберите их.`,
  );
}
