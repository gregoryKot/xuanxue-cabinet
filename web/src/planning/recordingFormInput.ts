// Чистая логика формы «Добавить запись» (CLAUDE.md «Тесты»): запись отдаётся
// ссылкой — телеграм-файл добавляет только бот (docs/PLAN.md §6 «Планирование»),
// поэтому здесь только `https://`-ссылка, без `telegramFileId`.
import { LESSON_LIMITS, type AddRecordingInput } from '@xuanxue/shared';

const HTTPS_RE = /^https:\/\//i;

/** `null` — форма валидна, иначе текст ошибки. */
export function validateRecordingForm(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'Укажите ссылку на запись.';
  if (!HTTPS_RE.test(trimmed)) return 'Ссылка должна начинаться с https://.';
  if (trimmed.length > LESSON_LIMITS.url) {
    return `Ссылка длиннее ${LESSON_LIMITS.url} символов.`;
  }
  return null;
}

export function toAddRecordingInput(title: string, url: string): AddRecordingInput {
  return { title: title.trim() || undefined, url: url.trim() };
}
