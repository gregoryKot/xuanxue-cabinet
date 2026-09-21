// Отправка видео экзамена по file_id, без перезаливки байтов (ADR-0023,
// ADR-0095) — свой метод Bot API на каждый вид вложения (exam-video-source.ts,
// media-asset.schema.ts: video/video_note/document). `callApi` типизирован по
// строковому литералу метода (как в telegram.adapter.ts, sendVideo/sendMessage
// там же), поэтому это `if`, а не таблица методов по переменной-строке. Тот же
// приём вызова, что bot-send.ts — общий таймаут и withTelegramSignal.
import type { Telegraf } from 'telegraf';
import type { ExamVideoTelegramType } from '../media/media-asset.schema';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  withTelegramSignal,
} from '../channels/telegram-client';

export async function sendBotExamVideo(
  bot: Telegraf,
  chatId: string,
  fileId: string,
  telegramType: ExamVideoTelegramType,
): Promise<void> {
  const opts = withTelegramSignal(AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS));
  if (telegramType === 'video') {
    await bot.telegram.callApi('sendVideo', { chat_id: chatId, video: fileId }, opts);
    return;
  }
  if (telegramType === 'video_note') {
    await bot.telegram.callApi(
      'sendVideoNote',
      { chat_id: chatId, video_note: fileId },
      opts,
    );
    return;
  }
  await bot.telegram.callApi('sendDocument', { chat_id: chatId, document: fileId }, opts);
}
