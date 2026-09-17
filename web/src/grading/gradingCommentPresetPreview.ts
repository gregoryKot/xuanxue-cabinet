// Обрезка текста заготовки для подписи кнопки (GradingCommentPresets.tsx) —
// чистая функция, юнит-тест без DOM. Полный текст всё равно уходит в
// комментарий при вставке (appendPresetText, gradingFormInput.ts) — здесь
// только то, что помещается на кнопке.
const PREVIEW_MAX_LENGTH = 40;
const ELLIPSIS = '…';

export function previewPresetText(text: string, maxLength = PREVIEW_MAX_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}${ELLIPSIS}`;
}
