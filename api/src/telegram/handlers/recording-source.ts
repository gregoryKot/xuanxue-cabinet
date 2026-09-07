// Источник записи из сообщения бота (docs/PLAN.md §6): ссылка https:// (в том
// числе YouTube) или видеофайл (video/document с mime video/*) — Telegram
// отдаёт file_id, бот публикует запись без перезаливки. Чистая функция, юнит-
// тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { Message } from 'telegraf/types';

export interface RecordingSource {
  url?: string;
  telegramFileId?: string;
}

// Первое совпадение где угодно в тексте, не только с начала строки: учитель
// часто пишет «вот запись https://…», а не голую ссылку — startsWith такое
// не ловил (правка по ревью PR I2b).
const URL_PATTERN = /https:\/\/\S+/;

/** `null` — сообщение не похоже на источник записи (обычный текст, стикер,
 * фото и т. п.). */
export function extractRecordingSource(
  message: Message | undefined,
): RecordingSource | null {
  if (!message) return null;
  if ('text' in message) {
    const match = message.text.trim().match(URL_PATTERN);
    return match ? { url: match[0] } : null;
  }
  if ('video' in message) return { telegramFileId: message.video.file_id };
  if ('document' in message) {
    return message.document.mime_type?.startsWith('video/')
      ? { telegramFileId: message.document.file_id }
      : null;
  }
  return null;
}
