// Контракт адаптера канала (ADR-0004): один интерфейс, по реализации на тип
// (telegram, vk, manual). Планировщик и `ChannelsService.test()` зовут его
// одинаково, не зная деталей провайдера.
import type { ChannelConfig, ChannelType } from '@xuanxue/shared';

export interface OutgoingMessage {
  text: string;
  /** Видео уже загружено в Telegram — шлём по file_id без перезаливки
   * (лимит 50 МБ бота не мешает, PLAN §6 «Бот»). */
  telegramFileId?: string;
  /** Ссылка на запись (YouTube) — ВК вставляет её в текст и не прикладывает
   * файлом (нужен пользовательский токен, см. `vk.adapter.ts`); поле здесь
   * остаётся для будущего адаптера с таким токеном. */
  videoUrl?: string;
}

export type SendResult =
  | { status: 'sent'; externalId?: string }
  // Доставку завершит человек кнопкой «скопировал, отправил» — Facebook/Boosty.
  | { status: 'manual' }
  | { status: 'failed'; error: string; retryable: boolean };

export interface ChannelAdapter {
  readonly type: ChannelType;
  send(message: OutgoingMessage, config: ChannelConfig): Promise<SendResult>;
}

/** Токен multi-провайдера — все адаптеры регистрируются под ним одним
 * массивом (channels.module.ts), `ChannelAdapterRegistry` выбирает по типу. */
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
