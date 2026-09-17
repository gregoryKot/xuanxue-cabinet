// Проверка ПАРАМЕТРА уже распознанного действия «действие:параметр»
// (callback-data.ts) — вынесено из callback-query.handler.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»): хендлер остаётся про доступ и маршрутизацию,
// разбор параметра — чистая функция, которую видно тестом без Telegram.
import { Types } from 'mongoose';
import { isNotificationKind } from '@xuanxue/shared';
import type { CallbackAction } from '../callback-data';
import { isMenuScreenAction } from './bot-menu';
import { parseOptionId, parseQuestionId } from './exam-callback-ids';
import { isExamItemKind } from './new-exam-item-types';

const NEW_EXAM_ITEM_DONE_TARGETS = ['options', 'correct'] as const;
const NEW_EXAM_ITEM_FLOW_ACTIONS = ['skip', 'save', 'cancel'] as const;
// Диалог «Собрать экзамен» (nep/nel/nen/nef, ТЗ 4б.4) — тем же приёмом, что
// новый вопрос выше; net без явной проверки — id всегда ObjectId вопроса,
// падает в default-ветку isValidCallbackParam.
const NEW_EXAM_PAGE_DIRECTIONS = ['prev', 'next'] as const;
const NEW_EXAM_TIME_LIMIT_IDS = ['none', '15', '30', '60'] as const;
const NEW_EXAM_ATTEMPTS_IDS = ['1', '2', '3'] as const;
const NEW_EXAM_FLOW_ACTIONS = ['cancel', 'publish'] as const;

/** Номер варианта черновика (nqo, ТЗ 4б.3) — тот же формат, что у номера
 * вопроса/варианта попытки (exam-callback-ids.ts), но без attemptId: у
 * черновика он один на чат (bot_sessions), варианты можно адресовать просто
 * позицией. */
function isOptionIndex(id: string): boolean {
  const index = Number(id);
  return Number.isInteger(index) && index >= 0;
}

/** cancel/topic/norec/sent/exam/es — id всегда ObjectId; notif —
 * NotificationKind (кнопка «Уведомления»); menu — экран меню; eq/eo —
 * составной параметр «попытка:номер[:номер]» (exam-callback-ids.ts); nqk —
 * ExamItemKind; nqo — номер варианта; nqd — какой шаг завершают; nqf —
 * что делает диалог дальше. Битый/чужой параметр — тихо игнорируется
 * вызывающим кодом, не ошибка. */
export function isValidCallbackParam(action: CallbackAction, id: string): boolean {
  if (action === 'notif') return isNotificationKind(id);
  if (action === 'menu') return isMenuScreenAction(id);
  if (action === 'eq') return parseQuestionId(id) !== null;
  if (action === 'eo') return parseOptionId(id) !== null;
  if (action === 'nqk') return isExamItemKind(id);
  if (action === 'nqo') return isOptionIndex(id);
  if (action === 'nqd') {
    return (NEW_EXAM_ITEM_DONE_TARGETS as readonly string[]).includes(id);
  }
  if (action === 'nqf')
    return (NEW_EXAM_ITEM_FLOW_ACTIONS as readonly string[]).includes(id);
  if (action === 'nep')
    return (NEW_EXAM_PAGE_DIRECTIONS as readonly string[]).includes(id);
  if (action === 'nea') return id === 'go';
  if (action === 'nel')
    return (NEW_EXAM_TIME_LIMIT_IDS as readonly string[]).includes(id);
  if (action === 'nen') return (NEW_EXAM_ATTEMPTS_IDS as readonly string[]).includes(id);
  if (action === 'nef') return (NEW_EXAM_FLOW_ACTIONS as readonly string[]).includes(id);
  return Types.ObjectId.isValid(id);
}
