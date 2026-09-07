// Callback data кнопок бота — формат «действие:параметр» (CLAUDE.md
// «Ошибки»: «callback data действие:параметр, параметры валидируются»).
// Параметр — всегда ObjectId (id рассылки/занятия/доставки), поэтому
// разбор и построение в одном месте, не по одной реализации на кнопку.
import type { InlineKeyboardButton } from 'telegraf/types';

const CALLBACK_ACTIONS = ['cancel', 'topic', 'norec', 'sent'] as const;
export type CallbackAction = (typeof CALLBACK_ACTIONS)[number];

function isCallbackAction(value: string): value is CallbackAction {
  return (CALLBACK_ACTIONS as readonly string[]).includes(value);
}

export interface ParsedCallback {
  action: CallbackAction;
  id: string;
}

/** `null` — не наш формат (чужая кнопка старой версии, битые данные): вызывающий
 * код просто игнорирует апдейт, без падения. */
export function parseCallbackData(data: string): ParsedCallback | null {
  const sep = data.indexOf(':');
  if (sep === -1) return null;
  const action = data.slice(0, sep);
  const id = data.slice(sep + 1);
  if (!isCallbackAction(action) || id === '') return null;
  return { action, id };
}

export function inlineButton(
  text: string,
  action: CallbackAction,
  id: string,
): InlineKeyboardButton {
  return { text, callback_data: `${action}:${id}` };
}
