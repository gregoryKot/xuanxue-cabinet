// Контракт адаптера канала (ADR-0004): один интерфейс, по реализации на тип
// (telegram, vk, manual). Планировщик и `ChannelsService.test()` зовут его
// одинаково, не зная деталей провайдера.
import type { ChannelConfig, ChannelType } from '@xuanxue/shared';

export interface OutgoingMessage {
  text: string;
  /** Видео уже загружено в Telegram — шлём по file_id без перезаливки
   * (лимит 50 МБ бота не мешает, PLAN §6 «Бот»). */
  telegramFileId?: string;
}

export type SendResult =
  | { status: 'sent'; externalId?: string }
  // Доставку завершит человек кнопкой «скопировал, отправил» — Facebook/Boosty.
  | { status: 'manual' }
  | {
      status: 'failed';
      error: string;
      retryable: boolean;
      /** Секунды до следующей попытки — Telegram присылает их в `parameters.retry_after`
       * ответа 429; сейчас единственный производитель поля (аудит M2,
       * docs/audits/2026-09-12-quality-audit.md). `nextDeliveryOutcome` не
       * планирует повтор раньше этого срока — иначе он попадёт в тот же лимит. */
      retryAfterSec?: number;
    };

export interface ChannelAdapter {
  readonly type: ChannelType;
  send(message: OutgoingMessage, config: ChannelConfig): Promise<SendResult>;
}

/** Токен multi-провайдера — все адаптеры регистрируются под ним одним
 * массивом (channels.module.ts), `ChannelAdapterRegistry` выбирает по типу. */
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
