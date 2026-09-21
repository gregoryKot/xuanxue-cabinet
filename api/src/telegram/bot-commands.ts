// Команды бота в меню Telegram, по scope (баг от владельца 2026-09-21:
// «зашёл в бот с ученика — видны все команды и для учителя, так не должно
// быть»). Раньше был один список на всех (BOT_COMMANDS/registerBotCommands):
// Telegram показывает его и ученику, и незнакомцу, хотя штатные хендлеры им
// молчат. Теперь три scope: all_private_chats — то, что отвечает любому
// вошедшему; chat (персонально) — полный список, только подключённому штату;
// default (группы) — пусто, там ни одна команда не отвечает (в группе бот
// только публикует рассылки, мёртвым пунктам там не место).
//
// Кириллические варианты команд остаются рабочими (register-handlers.ts,
// hears) — кто привык набирать «/тема», ничего не теряет.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Telegram } from 'telegraf';
import type { BotCommand } from 'telegraf/types';
import { errorMessage } from '../common/error-info';
import type { PersonalChats } from './personal-chats';

const logger = new Logger('bot-commands');

// Один источник текстов на оба списка — иначе описания расходятся незаметно,
// а два похожих объекта поймал бы check-jscpd-ratchet.mjs.
const DESCRIPTIONS = {
  menu: 'Меню бота',
  schedule: 'Ближайшие занятия',
  topic: 'Вписать тему занятия',
  exams: 'Экзамены',
  newquestion: 'Завести вопрос для экзамена',
  newexam: 'Собрать экзамен из вопросов',
  review: 'Проверить сданные работы',
  notifications: 'Что вам присылать',
  help: 'Что умеет бот',
} as const;

type BotCommandName = keyof typeof DESCRIPTIONS;

function commandsOf(names: readonly BotCommandName[]): readonly BotCommand[] {
  return names.map((command) => ({ command, description: DESCRIPTIONS[command] }));
}

// Ученику и правда отвечают: /exams (ADR-0024), /notifications (ADR-0065),
// /menu и /help — остальные пять команд штатные, их хендлеры ученику молчат.
export const STUDENT_BOT_COMMANDS: readonly BotCommand[] = commandsOf([
  'menu',
  'exams',
  'notifications',
  'help',
]);

export const STAFF_BOT_COMMANDS: readonly BotCommand[] = commandsOf([
  'menu',
  'schedule',
  'topic',
  'exams',
  'newquestion',
  'newexam',
  'review',
  'notifications',
  'help',
]);

/** Вызывается при старте приложения. Переписывает три scope целиком, так что
 * повторный вызов безвреден: (а) all_private_chats ← список ученика — всем,
 * кто написал боту; (б) default (группы) ← пусто; (в) chat ← полный список
 * каждому уже подключённому штату (PersonalChats.list — ровно личные чаты
 * штата с активным каналом). Не бросает: вызов идёт fire-and-forget при
 * старте, сбой сети не должен ронять подъём приложения (как у setWebhook,
 * telegram-bot.service.ts). */
export async function syncBotCommands(
  telegram: Telegram,
  personalChats: PersonalChats,
  now: DateTime,
): Promise<void> {
  try {
    await telegram.setMyCommands(STUDENT_BOT_COMMANDS, {
      scope: { type: 'all_private_chats' },
    });
    await telegram.setMyCommands([], { scope: { type: 'default' } });
    const staffChats = await personalChats.list(now);
    for (const chat of staffChats) {
      await telegram.setMyCommands(STAFF_BOT_COMMANDS, {
        scope: { type: 'chat', chat_id: chat.chatId },
      });
    }
  } catch (err) {
    logger.warn(`telegram.setMyCommands: ${errorMessage(err)}`);
  }
}

/** /start штата: полный список сразу на его личный чат — syncBotCommands
 * зовётся только при старте сервиса и этот чат ему ещё не известен.
 * Best-effort: /start уже подключил человека, не обновившееся меню — не
 * повод отвечать ему ошибкой. */
export async function setStaffBotCommands(
  telegram: Telegram,
  chatId: string,
): Promise<void> {
  try {
    await telegram.setMyCommands(STAFF_BOT_COMMANDS, {
      scope: { type: 'chat', chat_id: chatId },
    });
  } catch (err) {
    logger.warn(`telegram.setMyCommands: ${errorMessage(err)}`);
  }
}

/** /start человека, который перестал быть штатом: снимает персональный
 * штатный список с его чата — дальше он видит общий (ученический) список,
 * тем же best-effort, что и у setStaffBotCommands. */
export async function resetChatBotCommands(
  telegram: Telegram,
  chatId: string,
): Promise<void> {
  try {
    await telegram.deleteMyCommands({ scope: { type: 'chat', chat_id: chatId } });
  } catch (err) {
    logger.warn(`telegram.deleteMyCommands: ${errorMessage(err)}`);
  }
}
