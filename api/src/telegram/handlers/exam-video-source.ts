// Источник видео экзамена из сообщения бота (ADR-0023, docs/PLAN.md §11 слой
// 4.5): видеосообщение, «кружок» (video_note) или документ-видео — тот же
// приём, что recording-source.ts (документ-видео решение оттуда: телефон
// иногда отправляет большое видео файлом, а не как video). Чистая функция,
// юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»). Байты не трогаем — только
// `file_id`/`file_unique_id` и метаданные, которые Telegram даёт в самом
// апдейте (ADR-0023: `getFile` не зовём вовсе).
import type { Message } from 'telegraf/types';

export interface ExamVideoSource {
  fileId: string;
  fileUniqueId: string;
  durationSec?: number;
  sizeBytes?: number;
}

/** `null` — сообщение не похоже на видео (текст, стикер, фото и т. п.). */
export function extractExamVideoSource(
  message: Message | undefined,
): ExamVideoSource | null {
  if (!message) return null;
  if ('video' in message) {
    const { file_id, file_unique_id, duration, file_size } = message.video;
    return {
      fileId: file_id,
      fileUniqueId: file_unique_id,
      durationSec: duration,
      sizeBytes: file_size,
    };
  }
  if ('video_note' in message) {
    const { file_id, file_unique_id, duration, file_size } = message.video_note;
    return {
      fileId: file_id,
      fileUniqueId: file_unique_id,
      durationSec: duration,
      sizeBytes: file_size,
    };
  }
  if ('document' in message) {
    const doc = message.document;
    return doc.mime_type?.startsWith('video/')
      ? {
          fileId: doc.file_id,
          fileUniqueId: doc.file_unique_id,
          sizeBytes: doc.file_size,
        }
      : null;
  }
  return null;
}
