// Главное меню бота: что видит человек по /start и /menu — кнопки, а не
// стена текста (отзыв владельца 2026-09-12: «в боте кроме команды старт
// ничего нет»). Чистая логика без Mongo и без Telegram (CLAUDE.md «Логика
// вне контроллеров»): кому что положено — проверяется юнит-тестом, сами
// экраны рисуют bot-schedule.ts и notifications-menu.ts.
import { isStaffRole, type UserRole } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';

export type BotMenuAudience = 'staff' | 'student' | 'stranger';

/** `roles` — `null`, если человека с таким telegramId нет в базе. «Ученик»
 * здесь — не роль `student`, а любой найденный человек без учительских
 * ролей, включая того, кто просто вошёл в кабинет через Telegram-виджет. */
export function classifyBotMenuAudience(roles: UserRole[] | null): BotMenuAudience {
  if (!roles) return 'stranger';
  return isStaffRole(roles) ? 'staff' : 'student';
}

export interface BotMenu {
  text: string;
  buttons: InlineKeyboardButton[][];
}

const STRANGER_MESSAGE_BASE = 'Этот бот для учителя школы Сюань-Сюэ.';
const MENU_TEXT =
  'Что показать? Тему занятия можно вписать командой /topic, ' +
  'а запись — прислать сюда сообщением после занятия.';
const SCHEDULE_LABEL = 'Ближайшие занятия';
const NOTIFICATIONS_LABEL = 'Уведомления';
const EXAMS_LABEL = 'Экзамены';
const BACK_LABEL = 'В меню';

/** Незнакомцу (нет записи в users) меню не показываем — тот же вежливый
 * отказ, что был у /start: людей по сообщению боту мы не заводим. */
export function buildStrangerMessage(schoolSiteUrl?: string): string {
  if (!schoolSiteUrl) return STRANGER_MESSAGE_BASE;
  return `${STRANGER_MESSAGE_BASE} Расписание — на сайте ${schoolSiteUrl}`;
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
      [inlineButton(NOTIFICATIONS_LABEL, 'menu', 'notifications')],
    ],
  };
}

const STAFF_HELP_TEXT =
  'Бот показывает ближайшие занятия, помогает вписать тему и настроить ' +
  'уведомления. Команды: /menu — меню, /schedule — ближайшие занятия, ' +
  '/topic — вписать тему, /exams — экзамены, /notifications — уведомления. ' +
  'Запись занятия пришлите сюда сообщением — ссылкой или видео.';
const STUDENT_HELP_TEXT =
  'Экзамены можно сдать прямо здесь — команда /exams или кнопка ' +
  '«Экзамены» в меню. Бот присылает сюда напоминания, если вы их включили.';

/** Текст /help — по той же аудитории, что и меню. Незнакомцу — тот же
 * отказ, что у /start: рассказывать устройство бота человеку без доступа
 * нечего. */
export function buildHelpText(audience: BotMenuAudience, schoolSiteUrl?: string): string {
  if (audience === 'stranger') return buildStrangerMessage(schoolSiteUrl);
  return audience === 'staff' ? STAFF_HELP_TEXT : STUDENT_HELP_TEXT;
}

const MENU_SCREEN_ACTIONS = ['schedule', 'notifications', 'exams', 'back'] as const;
export type MenuScreenAction = (typeof MENU_SCREEN_ACTIONS)[number];

/** Параметр кнопки меню (`menu:schedule` и т.д.) — та же проверка формата,
 * что `isNotificationKind` у действия `notif`. */
export function isMenuScreenAction(value: string): value is MenuScreenAction {
  return (MENU_SCREEN_ACTIONS as readonly string[]).includes(value);
}
