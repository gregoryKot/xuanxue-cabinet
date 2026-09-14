// Callback data кнопок бота — формат «действие:параметр» (CLAUDE.md
// «Ошибки»: «callback data действие:параметр, параметры валидируются»).
// Параметр у cancel/topic/norec/sent — ObjectId (id рассылки/занятия/
// доставки), у notif — NotificationKind (кнопка «Уведомления»), у menu —
// экран главного меню (bot-menu.ts); разбор и
// построение — в одном месте, не по одной реализации на кнопку. Валидация
// формата параметра — за вызывающим кодом (по действию известно, что
// проверять), эта строка одинакова для обоих видов параметра.
//
// exam/es — ObjectId (id формы/попытки); eq/eo — составной параметр
// «attemptId:номер[:номер]» (вопрос/вариант в попытке, ТЗ 4б.2, ADR-0024) —
// разбор в exam-callback-ids.ts, тем же приёмом, что notif/menu: параметр
// внутри уже распознанного действия, не второй парсер этого файла.
import type { InlineKeyboardButton } from 'telegraf/types';

const CALLBACK_ACTIONS = [
  'cancel',
  'topic',
  'norec',
  'sent',
  'notif',
  'menu',
  'exam',
  'eq',
  'eo',
  'es',
] as const;
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
