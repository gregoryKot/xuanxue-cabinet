// Источник скриншота оплаты из сообщения бота (ADR-0050, docs/PLAN.md §15
// слой 2.2): фото (`message.photo` — массив размеров, берём последний, самый
// крупный — приём уже применён в exam-question-album-send.ts) или
// документ-картинка (`mime_type` из `image/*` — телефон иногда шлёт скрин
// файлом, не как photo) — тот же приём, что exam-video-source.ts. Байты не
// трогаем — только `file_id`/`file_unique_id`, `getFile` не зовём вовсе
// (ADR-0050).
import type { Message } from 'telegraf/types';

export interface PaymentScreenshotSource {
  fileId: string;
  fileUniqueId: string;
}

/** `null` — сообщение не похоже на скриншот (текст, стикер, видео и т. п.). */
export function extractPaymentScreenshotSource(
  message: Message | undefined,
): PaymentScreenshotSource | null {
  if (!message) return null;
  if ('photo' in message) {
    const largest = message.photo.at(-1); // самый большой размер — последний
    return largest
      ? { fileId: largest.file_id, fileUniqueId: largest.file_unique_id }
      : null;
  }
  if ('document' in message) {
    const doc = message.document;
    return doc.mime_type?.startsWith('image/')
      ? { fileId: doc.file_id, fileUniqueId: doc.file_unique_id }
      : null;
  }
  return null;
}
