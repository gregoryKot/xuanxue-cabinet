// Главное меню бота: что видит человек по /start и /menu — кнопки, а не
// стена текста (отзыв владельца 2026-09-12: «в боте кроме команды старт
// ничего нет»). Чистая логика без Mongo и без Telegram (CLAUDE.md «Логика
// вне контроллеров»): кому что положено — проверяется юнит-тестом, сами
// экраны рисуют bot-schedule.ts и notifications-menu.ts.
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';

// «Незнакомца» здесь больше нет (отзыв владельца 2026-09-21): аудиторию
// решает MenuCommandHandler через BotUserAccessService — unknown отвечает
// buildStrangerMessage напрямую, до этого типа дело не доходит. «Ученик» —
// не роль `student`, а любой найденный в users человек без штатной роли
// (isStaffRole), включая того, кто нашёл бота, не нажав /start учителем.
export type BotMenuAudience = 'staff' | 'student';

export interface BotMenu {
  text: string;
  buttons: InlineKeyboardButton[][];
}

// Отказ незнакомцу называет ученика и путь внутрь, а не учителя (ADR-0115,
// отзыв владельца 2026-09-22: «бот для ученика пишет, что это бот для
// учителя»). Прежняя строка «Этот бот для учителя школы Сюань-Сюэ» родилась,
// когда бот и правда был учительским; экзамены в боте (ADR-0024), личный
// канал ученика (ADR-0027) и его уведомления (ADR-0065) приехали позже, а
// текст, называющий аудиторию, остался прежним — и ученик, не нажавший
// «Связать Telegram» в кабинете, читал отказ как «вам сюда нельзя».
//
// Две ветки в одном тексте, потому что незнакомцы бывают двух видов и
// различить их мы не можем (и не должны — ответ одинаков для всех, SECURITY
// §2): у ученика школы кабинет есть, ему нужна кнопка связки; человека со
// стороны в школу заводит Дима руками (ADR-0030, ссылки-приглашения у него
// нет), ему нужен живой контакт.
const STRANGER_MESSAGE_BASE =
  'Это бот школы Сюань-Сюэ, для её учеников. Вас он пока не узнаёт. Уже ' +
  'занимаетесь — откройте кабинет, зайдите в «Профиль» и нажмите «Связать Telegram».';
const MENU_TEXT = 'Что показать?';
const SCHEDULE_LABEL = 'Ближайшие занятия';
const NOTIFICATIONS_LABEL = 'Уведомления';
const EXAMS_LABEL = 'Экзамены';
const NEW_EXAM_ITEM_LABEL = 'Новый вопрос';
const NEW_EXAM_LABEL = 'Собрать экзамен';
const BACK_LABEL = 'В меню';

/** Незнакомцу (нет записи в users) меню не показываем — тот же вежливый
 * отказ, что был у /start: людей по сообщению боту мы не заводим. Текст один
 * на всех незнакомцев, знаком ли нам этот telegramId или нет (SECURITY §2).
 *
 * `newcomerContact` — вторая ветка, для того, кто в школе ещё не занимается:
 * кабинета у него нет, и совет про «Связать Telegram» ему ничего не даёт.
 * Значение приходит из настроек школы (`SettingsService.get()`), не из
 * константы: сменить того, кому пишут новички, Дима должен уметь сам
 * (CLAUDE.md «Кабинет учителя: всё настраивается в интерфейсе»). Параметр
 * необязателен, чтобы отказ работал и на базе, где настроек ещё нет вовсе, —
 * тогда текст обрывается на связке, а не зовёт в пустоту. */
export function buildStrangerMessage(newcomerContact?: string): string {
  if (!newcomerContact) return STRANGER_MESSAGE_BASE;
  return `${STRANGER_MESSAGE_BASE} Ещё не занимаетесь в школе? Напишите ${newcomerContact}`;
}

/** Кнопка возврата — общая для экранов, куда уводит меню: человек не должен
 * искать, как вернуться, и набирать команду заново. */
export function backToMenuButton(): InlineKeyboardButton[] {
  return [inlineButton(BACK_LABEL, 'menu', 'back')];
}

export function buildBotMenu(): BotMenu {
  return {
    text: MENU_TEXT,
    buttons: [
      [inlineButton(SCHEDULE_LABEL, 'menu', 'schedule')],
      [inlineButton(EXAMS_LABEL, 'menu', 'exams')],
      // Только штат (menu-screens.ts — 'newitem' не перечисляется у ученика,
      // buildStudentMenu ниже): заводить вопрос ученику незачем (ТЗ 4б.3).
      [inlineButton(NEW_EXAM_ITEM_LABEL, 'menu', 'newitem')],
      // Сборка экзамена (ТЗ 4б.4) — тоже только штат, тем же приёмом.
      [inlineButton(NEW_EXAM_LABEL, 'menu', 'newexam')],
      [inlineButton(NOTIFICATIONS_LABEL, 'menu', 'notifications')],
    ],
  };
}

// Список команд не повторяем — Telegram уже показывает их в меню чата
// (bot-commands.ts, STAFF_BOT_COMMANDS); здесь только то, чего там нет.
const STAFF_HELP_TEXT = 'Запись занятия пришлите сюда сообщением — ссылкой или видео.';
const STUDENT_HELP_TEXT =
  'Экзамены можно сдать прямо здесь — команда /exams. Бот присылает сюда ' +
  'напоминания, если вы их включили.';

/** Меню ученика по /start (ADR-0027, docs/PLAN.md §11 слой 4.7) — узкое
 * намеренно: «Ближайшие занятия» (весь список занятий школы с ссылками
 * Zoom) и «Уведомления» штата (ошибки доставки, предпросмотр рассылки) —
 * экраны для учителя/помощника/админа, не для ученика (CLAUDE.md «Ноль
 * нагрузки на ученика» — лишняя кнопка, которая ничего не даёт). Текст —
 * тот же STUDENT_HELP_TEXT, что у /help: приветствие и есть объяснение, что
 * умеет бот, второй текст не сочиняем. */
export function buildStudentMenu(): BotMenu {
  return {
    text: STUDENT_HELP_TEXT,
    buttons: [[inlineButton(EXAMS_LABEL, 'menu', 'exams')]],
  };
}

/** Текст /help — по аудитории меню (штат/ученик). Незнакомцу отвечает сам
 * MenuCommandHandler текстом buildStrangerMessage — второй путь к тому же
 * отказу здесь не заводим (CLAUDE.md «Дубли и мёртвый код»). */
export function buildHelpText(audience: BotMenuAudience): string {
  return audience === 'staff' ? STAFF_HELP_TEXT : STUDENT_HELP_TEXT;
}

const MENU_SCREEN_ACTIONS = [
  'schedule',
  'notifications',
  'exams',
  'newitem',
  'newexam',
  'back',
] as const;
export type MenuScreenAction = (typeof MENU_SCREEN_ACTIONS)[number];

/** Параметр кнопки меню (`menu:schedule` и т.д.) — та же проверка формата,
 * что `isNotificationKind` у действия `notif`. */
export function isMenuScreenAction(value: string): value is MenuScreenAction {
  return (MENU_SCREEN_ACTIONS as readonly string[]).includes(value);
}
