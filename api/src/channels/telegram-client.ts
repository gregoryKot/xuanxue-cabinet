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

// Бюджет одного хендлера апдейта (Telegraf `handlerTimeout`, аудит 2026-10-01,
// F52): дефолтные 90 с Telegraf при молчащем Telegram держали каждый апдейт до
// полутора минут. Больше бюджета одного вызова выше: хендлер — это несколько
// вызовов Bot API подряд (альбом вопроса шлёт по фото на вариант, при первой
// отправке — байтами: exam-question-album-send.ts, exam-question-photo-send.ts),
// и 15 с резали бы легитимный альбом из 4–5 фото на медленном аплинке с ложным
// «TimeoutError» при фактически успешной отправке (p-timeout промис не
// отменяет — хендлер дорабатывает в фоне). Вызовы через `ctx.*` без `signal`
// гейт check-outbound-timeout.mjs не видит — их держит именно этот порог.
export const TELEGRAF_HANDLER_TIMEOUT_MS = 30_000;

// telegraf типизирует `signal` через устаревший пакет `abort-controller`,
// структурно несовместимый с нативным AbortSignal.timeout() при одинаковом
// рантайм-поведении — приводим один раз здесь, не на каждый вызов callApi.
type CallApiOptions = NonNullable<Parameters<TelegramApiClient['callApi']>[2]>;
export function withTelegramSignal(signal: AbortSignal): CallApiOptions {
  return { signal } as unknown as CallApiOptions;
}

/** Опции очередного вызова Bot API с таймаутом — вызов, у которого нет
 * `signal`, при молчащей сети держит запрос до таймаута платформы
 * (scripts/check-outbound-timeout.mjs). Свежий сигнал на каждый вызов: он
 * стартует в момент создания и общим на несколько вызовов не бывает. */
export function telegramCallOptions(): CallApiOptions {
  return withTelegramSignal(AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS));
}
