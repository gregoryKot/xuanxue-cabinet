// Фабрика клиента Telegram Bot API (только `Telegram` из telegraf — без
// бота, сцен и вебхука, это следующий PR). Инъекция через DI-токен, а не
// прямой `new Telegram(token)` в адаптере — в спеках подменяется фейком,
// который ничего не шлёт в сеть (CLAUDE.md «Тесты»: реальные вызовы
// замоканы). Мессенджеры только через api/src/channels|telegram — eslint.
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
