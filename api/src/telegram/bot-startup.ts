// Прогрев botInfo, регистрация вебхука и строка лога для `bot.catch` при
// старте — вынесено из telegram-bot.service.ts (файл-лимит 150 строк,
// CLAUDE.md «Храповики»): самостоятельный кусок старта бота, не про
// маршрутизацию апдейтов.
import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Telegraf } from 'telegraf';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  withTelegramSignal,
} from '../channels/telegram-client';
import { errorMessage } from '../common/error-info';

// p-timeout внутри Telegraf.handleUpdate бросает ошибку с именем `TimeoutError`
// по истечении handlerTimeout (TELEGRAF_HANDLER_TIMEOUT_MS, F52).
const HANDLER_TIMEOUT_ERROR_NAME = 'TimeoutError';

/** Строка error-лога для `bot.catch`: истёкший handlerTimeout помечается
 * отдельно (`telegram.update.timeout`), чтобы в логах Railway отличать
 * «Telegram молчит» от падения самого хендлера (RUNBOOK §8.2, аудит
 * 2026-10-01, F52). */
export function updateErrorLogLine(err: unknown): string {
  const label =
    err instanceof Error && err.name === HANDLER_TIMEOUT_ERROR_NAME
      ? 'telegram.update.timeout'
      : 'telegram.update';
  return `${label}: ${errorMessage(err)}`;
}

// Литерал, не константа из app.setup.ts: там `app.setGlobalPrefix('api')` не
// экспортирует префикс наружу — заводить экспорт ради одного потребителя
// сейчас не стоит, префикс задокументирован здесь же.
export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
const ALLOWED_UPDATES = ['message', 'my_chat_member', 'callback_query'] as const;

/** telegraf зовёт `telegram.getMe()` лениво, но кэширует даже ОТКЛОНЁННЫЙ
 * промис в приватном `botInfoCall` (telegraf.js, handleUpdate) — после
 * первого сетевого сбоя бот молчал бы навсегда. Выставляем публичное
 * `bot.botInfo` сами раньше, чем telegraf туда заглянет; при отказе не
 * выставляем ничего — следующий апдейт пробует снова. */
export async function ensureBotInfo(bot: Telegraf): Promise<void> {
  if (bot.botInfo) return;
  const signal = AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS);
  bot.botInfo = await bot.telegram.callApi('getMe', {}, withTelegramSignal(signal));
}

/** Регистрация только при полном комплекте: BOT_TOKEN (уже проверен
 * вызывающим), PUBLIC_URL и TELEGRAM_WEBHOOK_SECRET заданы, NODE_ENV=production
 * — иначе локальная разработка на каждом старте пыталась бы перехватить
 * вебхук прод-бота. `new URL(path, base)`, не конкатенация строк: устойчиво
 * к завершающему слэшу в PUBLIC_URL (валидатор его и так запрещает —
 * вторая линия защиты от «//» в пути). */
export async function registerWebhook(
  bot: Telegraf,
  config: ConfigService,
  logger: Logger,
): Promise<void> {
  const nodeEnv = config.get<string>('NODE_ENV');
  const publicUrl = config.get<string>('PUBLIC_URL');
  const secretToken = config.get<string>('TELEGRAM_WEBHOOK_SECRET');
  if (nodeEnv !== 'production' || !publicUrl || !secretToken) {
    logger.warn(
      'Вебхук бота не зарегистрирован: нужны production, PUBLIC_URL и ' +
        'TELEGRAM_WEBHOOK_SECRET (RUNBOOK §5).',
    );
    return;
  }
  const url = new URL(TELEGRAM_WEBHOOK_PATH, publicUrl).toString();
  const signal = AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS);
  await bot.telegram.callApi(
    'setWebhook',
    { url, secret_token: secretToken, allowed_updates: [...ALLOWED_UPDATES] },
    withTelegramSignal(signal),
  );
}
