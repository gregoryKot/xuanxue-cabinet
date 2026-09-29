// Клиентская подсказка по тому же allow-list, что и сервер (docs/PLAN.md §6
// «Шаблоны», ADR-0011) — учитель видит опечатку в `{имя}` до отправки формы,
// не только после 400 с сервера.
import { findUnknownPlaceholders, SETTINGS_LIMITS } from '@xuanxue/shared';

/** `null` — текст валиден, иначе текст первой найденной ошибки. Набор
 * допустимых подстановок — параметр: у поста он свой, у напоминания об оплате
 * свой (`PAYMENT_REMINDER_PLACEHOLDERS`); не передан — подстановки поста. */
export function validateTemplateText(
  text: string,
  allowList?: readonly string[],
): string | null {
  if (!text.trim()) return 'Шаблон не может быть пустым.';
  if (text.length > SETTINGS_LIMITS.templateMaxLength) {
    return `Шаблон длиннее ${SETTINGS_LIMITS.templateMaxLength} знаков.`;
  }
  const unknown = findUnknownPlaceholders(text, allowList);
  if (unknown.length > 0) {
    return `Неизвестные подстановки: ${unknown.map((name) => `{${name}}`).join(', ')}.`;
  }
  return null;
}
