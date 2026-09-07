// Клиентская подсказка по тому же allow-list, что и сервер (docs/PLAN.md §6
// «Шаблоны», ADR-0011) — учитель видит опечатку в `{имя}` до отправки формы,
// не только после 400 с сервера.
import { findUnknownPlaceholders, SETTINGS_LIMITS } from '@xuanxue/shared';

/** `null` — текст валиден, иначе текст первой найденной ошибки. */
export function validateTemplateText(text: string): string | null {
  if (!text.trim()) return 'Шаблон не может быть пустым.';
  if (text.length > SETTINGS_LIMITS.templateMaxLength) {
    return `Шаблон длиннее ${SETTINGS_LIMITS.templateMaxLength} знаков.`;
  }
  const unknown = findUnknownPlaceholders(text);
  if (unknown.length > 0) {
    return `Неизвестные подстановки: ${unknown.map((name) => `{${name}}`).join(', ')}.`;
  }
  return null;
}
