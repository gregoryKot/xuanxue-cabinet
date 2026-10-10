// Чистая логика формы «Добавить запись» (CLAUDE.md «Тесты»): запись отдаётся
// файлом (загружен в кабинет, `videoId`, ADR-0180), ссылкой или тем и другим —
// это одна запись и один пост. Телеграм-файл добавляет только бот (docs/PLAN.md
// §6 «Планирование»), поэтому `telegramFileId` здесь нет.
import { LESSON_LIMITS, type AddRecordingInput } from '@xuanxue/shared';
import { isHttpsUrl } from '../lib/httpsUrl';

const NO_SOURCE_MESSAGE = 'Выберите файл записи или укажите ссылку.';

/** `null` — форма валидна, иначе текст ошибки. Ссылка необязательна, если файл
 * уже загружен (`hasVideo`), но вписанная ссылка проверяется всегда. */
export function validateRecordingForm(url: string, hasVideo = false): string | null {
  const trimmed = url.trim();
  if (!trimmed) return hasVideo ? null : NO_SOURCE_MESSAGE;
  if (!isHttpsUrl(trimmed)) return 'Ссылка должна начинаться с https://.';
  if (trimmed.length > LESSON_LIMITS.url) {
    return `Ссылка длиннее ${LESSON_LIMITS.url} символов.`;
  }
  return null;
}

export function toAddRecordingInput(
  title: string,
  url: string,
  videoId?: string,
): AddRecordingInput {
  return {
    title: title.trim() || undefined,
    url: url.trim() || undefined,
    videoId,
  };
}
