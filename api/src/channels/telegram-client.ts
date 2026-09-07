// Фабрика клиента Telegram Bot API (`Telegram` из telegraf — сам бот,
// сцены и вебхук живут в api/src/telegram/, ADR-0015). Инъекция через
// DI-токен, а не прямой `new Telegram(token)` в адаптере — в спеках
// подменяется фейком, который ничего не шлёт в сеть (CLAUDE.md «Тесты»:
// реальные вызовы замоканы). Мессенджеры только через
// api/src/channels|telegram — eslint.
import { Telegram } from 'telegraf';

/** `callApi` — единственный метод `Telegram`, которым пользуется адаптер:
 * публичный на `ApiClient` (`typings/core/network/client.d.ts`), принимает
 * `{ signal }` третьим параметром — обёртки вроде `sendMessage` его не
 * пробрасывают, поэтому адаптер зовёт `callApi` напрямую (телеграм.adapter.ts). */
export type TelegramApiClient = Pick<Telegram, 'callApi'>;

export type TelegramClientFactory = (token: string) => TelegramApiClient;

export const TELEGRAM_CLIENT_FACTORY = Symbol('TELEGRAM_CLIENT_FACTORY');

export function createTelegramClient(token: string): TelegramApiClient {
  return new Telegram(token);
}

// Общий бюджет ожидания одного вызова Bot API — telegram.adapter.ts
// (sendMessage/sendVideo) и telegram-bot.service.ts (getMe/setWebhook)
// делят один лимит и один способ передать AbortSignal.
export const TELEGRAM_CALL_TIMEOUT_MS = 10_000;

// telegraf типизирует `signal` через устаревший пакет `abort-controller`,
// структурно несовместимый с нативным AbortSignal.timeout() при одинаковом
// рантайм-поведении — приводим один раз здесь, не на каждый вызов callApi.
type CallApiOptions = NonNullable<Parameters<TelegramApiClient['callApi']>[2]>;
export function withTelegramSignal(signal: AbortSignal): CallApiOptions {
  return { signal } as unknown as CallApiOptions;
}
