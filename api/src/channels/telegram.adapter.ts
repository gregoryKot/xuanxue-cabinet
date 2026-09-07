// ChannelAdapter для Telegram: клиент API Telegram (telegraf); сам бот,
// сцены и вебхук — в api/src/telegram/ (ADR-0015). plain text, без
// parse_mode (PLAN §6: подстановки не экранируются, посты идут как обычный
// текст).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isTelegramChannelConfig,
  type ChannelConfig,
  type ChannelType,
} from '@xuanxue/shared';
import { scrubChannelSecrets } from './channel-secrets';
import type { ChannelAdapter, OutgoingMessage, SendResult } from './channel-adapter';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  TELEGRAM_CLIENT_FACTORY,
  withTelegramSignal,
  type TelegramApiClient,
  type TelegramClientFactory,
} from './telegram-client';

// Лимит подписи sendVideo (Bot API) — длиннее подпись не проходит, шлём
// видео без неё и следом обычным сообщением.
const CAPTION_LIMIT = 1024;
const NO_TOKEN_MESSAGE = 'Бот Telegram не подключён. Напишите администратору школы.';
const NO_CONFIG_MESSAGE = 'У канала нет chatId — подключите канал заново';
const NOT_ADMIN_MESSAGE =
  'Бот не админ канала. Добавьте бота администратором и повторите тест.';
const CHAT_NOT_FOUND_MESSAGE = 'Чат не найден. Проверьте адрес канала.';
const TEMPORARY_MESSAGE = 'Telegram временно недоступен. Повторите позже.';

@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'telegram';
  private readonly logger = new Logger(TelegramAdapter.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(TELEGRAM_CLIENT_FACTORY)
    private readonly clientFactory: TelegramClientFactory,
  ) {}

  async send(message: OutgoingMessage, config: ChannelConfig): Promise<SendResult> {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) return { status: 'failed', error: NO_TOKEN_MESSAGE, retryable: false };
    if (!isTelegramChannelConfig(config)) {
      return { status: 'failed', error: NO_CONFIG_MESSAGE, retryable: false };
    }

    const client = this.clientFactory(token);
    const signal = AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS);
    try {
      const externalId = message.telegramFileId
        ? await this.sendVideo(
            client,
            config.chatId,
            message.telegramFileId,
            message.text,
            signal,
          )
        : await this.sendText(client, config.chatId, message.text, signal);
      return { status: 'sent', externalId };
    } catch (err) {
      return this.toFailedResult(err, config, token);
    }
  }

  private async sendText(
    client: TelegramApiClient,
    chatId: string,
    text: string,
    signal: AbortSignal,
  ): Promise<string> {
    const result = await client.callApi(
      'sendMessage',
      { chat_id: chatId, text },
      withTelegramSignal(signal),
    );
    return String(result.message_id);
  }

  private async sendVideo(
    client: TelegramApiClient,
    chatId: string,
    fileId: string,
    text: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (text.length <= CAPTION_LIMIT) {
      const result = await client.callApi(
        'sendVideo',
        { chat_id: chatId, video: fileId, caption: text },
        withTelegramSignal(signal),
      );
      return String(result.message_id);
    }
    await client.callApi(
      'sendVideo',
      { chat_id: chatId, video: fileId },
      withTelegramSignal(signal),
    );
    return this.sendText(client, chatId, text, signal);
  }

  // Сырой текст может содержать BOT_TOKEN (в URL Telegram) — в лог только
  // после scrub (SECURITY §6); scrub SendResult.error — в ChannelsService.
  private toFailedResult(err: unknown, config: ChannelConfig, token: string): SendResult {
    const raw = err instanceof Error ? err.message : 'Не удалось отправить сообщение';
    this.logger.warn(scrubChannelSecrets(raw, config, token));
    if (!isTelegramApiError(err))
      return { status: 'failed', error: raw, retryable: true };
    return {
      status: 'failed',
      error: messageForCode(err.code),
      retryable: isRetryableCode(err.code),
    };
  }
}

function isTelegramApiError(err: unknown): err is { code: number; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof err.code === 'number'
  );
}

// 429/5xx — временная перегрузка или сбой на стороне Telegram, повтор
// планировщика может сработать; 400/403 — бот не админ канала, чат не
// найден и т.п., без смены конфигурации повтор не поможет.
function isRetryableCode(code: number): boolean {
  return code === 429 || code >= 500;
}

function messageForCode(code: number): string {
  if (code === 403) return NOT_ADMIN_MESSAGE;
  if (code === 400) return CHAT_NOT_FOUND_MESSAGE;
  if (isRetryableCode(code)) return TEMPORARY_MESSAGE;
  return `Telegram отклонил сообщение (код ${code}). Проверьте настройки бота.`;
}
