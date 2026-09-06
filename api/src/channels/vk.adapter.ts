// ChannelAdapter для ВК: `messages.send` в беседу, куда добавлен бот
// сообщества. `video.save` (прикрепить видео с YouTube по ссылке) сюда
// сознательно не входит: этот метод требует пользовательского токена со
// scope `video`, а у школы — токен сообщества (PLAN §8, риск про ВК).
// Ссылку в текст кладёт составитель поста — адаптер поле `videoUrl` только
// игнорирует, ВК сам рисует превью по ссылке из текста.
import { randomInt } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { isVkChannelConfig, type ChannelConfig, type ChannelType } from '@xuanxue/shared';
import { scrubChannelSecrets } from './channel-secrets';
import type { ChannelAdapter, OutgoingMessage, SendResult } from './channel-adapter';

const VK_API_URL = 'https://api.vk.com/method/messages.send';
const VK_API_VERSION = '5.199';
const VK_TIMEOUT_MS = 10_000;
const RANDOM_ID_MAX = 2_147_483_647; // Int32 — формат random_id ВК.
const NO_CONFIG_MESSAGE = 'У канала нет токена ВК. Подключите канал заново.';
const TOKEN_MESSAGE =
  'Токен сообщества не подходит или у бота нет прав. Проверьте токен и доступ к беседе.';
const TEMPORARY_MESSAGE = 'ВК временно недоступен. Повторите позже.';

interface VkSendResponse {
  response?: number;
  error?: { error_code: number; error_msg: string };
}

// 5/7/15 — неверный токен, нет прав, доступ запрещён: без нового токена не
// поможет, отдельное сообщение про токен. 6/9/10 — превышена частота
// запросов и внутренние сбои ВК: временные, единственные ретраебл-коды ответа
// (HTTP-уровень — сетевые ошибки и 5xx/429 — ретраебл отдельно, ниже).
const TOKEN_CODES = new Set([5, 7, 15]);
const RETRYABLE_CODES = new Set([6, 9, 10]);

@Injectable()
export class VkAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'vk';
  private readonly logger = new Logger(VkAdapter.name);

  async send(message: OutgoingMessage, config: ChannelConfig): Promise<SendResult> {
    if (!isVkChannelConfig(config)) {
      return { status: 'failed', error: NO_CONFIG_MESSAGE, retryable: false };
    }

    const body = new URLSearchParams({
      access_token: config.token,
      peer_id: String(config.peerId),
      random_id: String(randomInt(RANDOM_ID_MAX)),
      message: message.text,
      v: VK_API_VERSION,
    });

    try {
      const res = await fetch(VK_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(VK_TIMEOUT_MS),
      });
      if (!res.ok) {
        return {
          status: 'failed',
          error: `ВК ответил ${res.status}`,
          retryable: res.status === 429 || res.status >= 500,
        };
      }
      const data = (await res.json()) as VkSendResponse;
      if (data.error) {
        this.logger.warn(scrubChannelSecrets(data.error.error_msg, config));
        return toFailedResult(data.error.error_code);
      }
      return { status: 'sent', externalId: String(data.response) };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Не удалось отправить сообщение';
      return { status: 'failed', error, retryable: true };
    }
  }
}

function toFailedResult(code: number): SendResult {
  if (TOKEN_CODES.has(code)) {
    return { status: 'failed', error: TOKEN_MESSAGE, retryable: false };
  }
  if (RETRYABLE_CODES.has(code)) {
    return { status: 'failed', error: TEMPORARY_MESSAGE, retryable: true };
  }
  return {
    status: 'failed',
    error: `ВК отклонил сообщение (код ${code}). Проверьте настройки беседы.`,
    retryable: false,
  };
}
