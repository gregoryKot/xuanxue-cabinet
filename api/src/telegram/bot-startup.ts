// Прогрев botInfo и регистрация вебхука при старте — вынесено из
// telegram-bot.service.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»):
// самостоятельный кусок старта бота, не про маршрутизацию апдейтов.
import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Telegraf } from 'telegraf';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  withTelegramSignal,
} from '../channels/telegram-client';

// Литерал, не константа из app.setup.ts: там `app.setGlobalPrefix('api')` не
// экспортирует префикс наружу — заводить экспорт ради одного потребителя
// сейчас не стоит, префикс задокументирован здесь же.
export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
// chat_member — без него в списке Telegram не пришлёт апдейт о вступлении
// человека в группу, даже когда бот там администратор (ещё одно условие,
// на стороне Telegram, — см. chat-member-join.handler.ts и RUNBOOK §8.15).
const ALLOWED_UPDATES = [
  'message',
  'my_chat_member',
  'chat_member',
  'callback_query',
] as const;

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
