// Отправка сообщения с опциональной инлайн-клавиатурой в конкретный чат —
// вынесено из telegram-bot.service.ts (файл-лимит 150 строк): один вызов
// `callApi` нужен всем проактивным отправителям (предпросмотр, «Запись?»,
// ручные каналы, уведомления учителю) — единственная точка сборки запроса,
// не по копии в каждом сервисе.
import type { Telegraf } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  withTelegramSignal,
} from '../channels/telegram-client';

export async function sendBotMessage(
  bot: Telegraf,
  chatId: string,
  text: string,
  buttons?: InlineKeyboardButton[][],
): Promise<void> {
  const signal = AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS);
  await bot.telegram.callApi(
    'sendMessage',
    {
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    },
    withTelegramSignal(signal),
  );
}
