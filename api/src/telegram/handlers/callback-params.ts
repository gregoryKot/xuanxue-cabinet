// Проверка ПАРАМЕТРА уже распознанного действия «действие:параметр»
// (callback-data.ts) — вынесено из callback-query.handler.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»): хендлер остаётся про доступ и маршрутизацию,
// разбор параметра — чистая функция, которую видно тестом без Telegram.
import { Types } from 'mongoose';
import { isNotificationKind } from '@xuanxue/shared';
import type { CallbackAction } from '../callback-data';
import { isMenuScreenAction } from './bot-menu';
import { parseOptionId, parseQuestionId } from './exam-callback-ids';

/** cancel/topic/norec/sent/exam/es — id всегда ObjectId; notif —
 * NotificationKind (кнопка «Уведомления»); menu — экран меню; eq/eo —
 * составной параметр «попытка:номер[:номер]» (exam-callback-ids.ts). Битый/
 * чужой параметр — тихо игнорируется вызывающим кодом, не ошибка. */
export function isValidCallbackParam(action: CallbackAction, id: string): boolean {
  if (action === 'notif') return isNotificationKind(id);
  if (action === 'menu') return isMenuScreenAction(id);
  if (action === 'eq') return parseQuestionId(id) !== null;
  if (action === 'eo') return parseOptionId(id) !== null;
  return Types.ObjectId.isValid(id);
}
