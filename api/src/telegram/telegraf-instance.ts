// Фабрика Telegraf-инстанса — та же причина, что у TELEGRAM_CLIENT_FACTORY
// (channels/telegram-client.ts): инъекция через DI-токен, а не прямой
// `new Telegraf(token)` в сервисе, чтобы в спеках подменялась фейком без
// сети (CLAUDE.md «Тесты»). Мессенджеры только через api/src/telegram|channels
// — eslint (MESSENGER_ADAPTER_GLOBS).
import { Telegraf } from 'telegraf';
import { TELEGRAF_HANDLER_TIMEOUT_MS } from '../channels/telegram-client';

export type TelegrafFactory = (token: string) => Telegraf;

export const TELEGRAF_FACTORY = Symbol('TELEGRAF_FACTORY');

export function createTelegraf(token: string): Telegraf {
  // handlerTimeout — почему не дефолтные 90 с, см. TELEGRAF_HANDLER_TIMEOUT_MS
  // (аудит 2026-10-01, F52).
  return new Telegraf(token, { handlerTimeout: TELEGRAF_HANDLER_TIMEOUT_MS });
}
