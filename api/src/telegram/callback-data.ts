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
//
// exc — вопрос «Вы начинаете экзамен» перед стартом попытки с лимитом
// времени (id — ObjectId формы, ADR-0121, отзыв владельца 2026-09-22:
// «индикацию поярче»): кнопка списка форм с лимитом ведёт сюда вместо exam,
// а сам экран подтверждения ведёт кнопкой «Начать экзамен» уже на exam —
// exam остаётся «начать сейчас», второго действия старта не заводим.
//
// nqk/nqo/nqd/nqf — диалог «Новый вопрос» (ТЗ 4б.3, PLAN.md §12), только
// штат (как topic/notif, не как exam/eq/eo/es): nqk — тип вопроса (id —
// ExamItemKind); nqo — переключить вариант верным (id — номер варианта);
// nqd — «Готово» промежуточного шага (id — 'options'|'correct'); nqf —
// управление диалогом (id — 'save'|'cancel'). Разбор — тем же приёмом,
// что isNotificationKind/isMenuScreenAction — в new-exam-item-types.ts и
// самих хендлерах, не здесь.
//
// net/nep/nea/nel/nen/nef — диалог «Собрать экзамен» (ТЗ 4б.4, PLAN.md §12),
// только штат: net — отметить/снять вопрос (id — ObjectId вопроса, разбор
// падает в default-ветку isValidCallbackParam); nep — страница списка (id —
// 'prev'|'next'); nea — «Собрать (k)» (id — 'go'); nel — лимит времени (id —
// 'none'|'15'|'30'|'60'); nen — число попыток (id — '1'|'2'|'3'); nef —
// управление диалогом (id — 'cancel'|'publish').
//
// grade/gradesk/gradecl/gradeq — проверка сданной работы (ТЗ 4б.5, PLAN §12),
// только штат: grade — итог («Зачёт»/«Доработать»/«Незачёт», id —
// «attemptId:outcome», grade-callback-id.ts); gradesk — «Без комментария»
// (id — attemptId, итог берётся из bot_sessions); gradecl — «Отмена» (id —
// attemptId); gradeq — открыть карточку из /проверка (id — attemptId).
import type { InlineKeyboardButton } from 'telegraf/types';

const CALLBACK_ACTIONS = [
  'cancel',
  'topic',
  'norec',
  'sent',
  'notif',
  'menu',
  'exam',
  'exc',
  'eq',
  'eo',
  'es',
  'nqk',
  'nqo',
  'nqd',
  'nqf',
  'net',
  'nep',
  'nea',
  'nel',
  'nen',
  'nef',
  'grade',
  'gradesk',
  'gradecl',
  'gradeq',
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
