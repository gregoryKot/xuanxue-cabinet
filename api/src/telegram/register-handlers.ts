// Регистрация хендлеров бота — вынесено из telegram-bot.service.ts (файл-
// лимит 150 строк, CLAUDE.md «Храповики»): сборка Telegraf-инстанса и вебхук
// остаются в сервисе, разбор апдейта по типу — здесь.
import { DateTime } from 'luxon';
import type { Telegraf } from 'telegraf';
import type { CallbackQueryHandler } from './handlers/callback-query.handler';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { ExamCommandHandler } from './handlers/exam-command.handler';
import type { MessageHandler } from './handlers/message.handler';
import type { MenuCommandHandler } from './handlers/menu-command.handler';
import type { NewExamItemCommandHandler } from './handlers/new-exam-item-command.handler';
import type { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import type { StartHandler } from './handlers/start.handler';
import type { TopicCommandHandler } from './handlers/topic-command.handler';

// /тема, /уведомления — кириллица, entity 'bot_command' её не разбирает
// (BotFather требует латиницу), поэтому hears() по тексту, не command().
// `\b` тут не работает: в JS `\w` — только ASCII, кириллица для него не
// «словесный» символ, между последней буквой и пробелом/концом строки
// границы слова нет и `\b` не матчится никогда (баг, найден на ревью PR
// I2b) — вместо этого явный список разделителей: конец строки, пробел или
// `@botname`.
const TOPIC_COMMAND_PATTERN = /^\/тема(?:@[A-Za-z0-9_]+)?(?:\s|$)/i;
const NOTIFICATIONS_COMMAND_PATTERN = /^\/уведомления(?:@[A-Za-z0-9_]+)?(?:\s|$)/i;
const EXAMS_COMMAND_PATTERN = /^\/экзамены(?:@[A-Za-z0-9_]+)?(?:\s|$)/i;
const NEW_EXAM_ITEM_COMMAND_PATTERN = /^\/вопрос(?:@[A-Za-z0-9_]+)?(?:\s|$)/i;

export interface BotHandlers {
  chatMemberHandler: ChatMemberHandler;
  startHandler: StartHandler;
  callbackQueryHandler: CallbackQueryHandler;
  topicCommandHandler: TopicCommandHandler;
  notificationsCommandHandler: NotificationsCommandHandler;
  menuCommandHandler: MenuCommandHandler;
  messageHandler: MessageHandler;
  examCommandHandler: ExamCommandHandler;
  newExamItemCommandHandler: NewExamItemCommandHandler;
}

/** `DateTime.utc()` — на каждый апдейт заново (CLAUDE.md «Время»): здесь, а
 * не в самих хендлерах, единственное место, где бот зовёт «сейчас». Порядок
 * hears() до on('message') важен — Telegraf сам зовёт next(), когда регэксп
 * не совпал, и сообщение попадает в MessageHandler. */
export function registerHandlers(bot: Telegraf, handlers: BotHandlers): void {
  bot.start((ctx) => handlers.startHandler.handle(ctx, DateTime.utc()));
  bot.on('my_chat_member', (ctx) => handlers.chatMemberHandler.handle(ctx));
  bot.on('callback_query', (ctx) =>
    handlers.callbackQueryHandler.handle(ctx, DateTime.utc()),
  );
  // Латинские команды — те, что Telegram показывает в меню (bot-commands.ts).
  bot.command('menu', (ctx) => handlers.menuCommandHandler.showMenu(ctx, DateTime.utc()));
  bot.command('schedule', (ctx) =>
    handlers.menuCommandHandler.showSchedule(ctx, DateTime.utc()),
  );
  bot.command('help', (ctx) => handlers.menuCommandHandler.showHelp(ctx, DateTime.utc()));
  bot.command('topic', (ctx) => handlers.topicCommandHandler.handle(ctx, DateTime.utc()));
  bot.command('notifications', (ctx) =>
    handlers.notificationsCommandHandler.handle(ctx, DateTime.utc()),
  );
  bot.command('exams', (ctx) => handlers.examCommandHandler.handle(ctx, DateTime.utc()));
  bot.command('newquestion', (ctx) =>
    handlers.newExamItemCommandHandler.handle(ctx, DateTime.utc()),
  );
  bot.hears(TOPIC_COMMAND_PATTERN, (ctx) =>
    handlers.topicCommandHandler.handle(ctx, DateTime.utc()),
  );
  bot.hears(NOTIFICATIONS_COMMAND_PATTERN, (ctx) =>
    handlers.notificationsCommandHandler.handle(ctx, DateTime.utc()),
  );
  bot.hears(EXAMS_COMMAND_PATTERN, (ctx) =>
    handlers.examCommandHandler.handle(ctx, DateTime.utc()),
  );
  bot.hears(NEW_EXAM_ITEM_COMMAND_PATTERN, (ctx) =>
    handlers.newExamItemCommandHandler.handle(ctx, DateTime.utc()),
  );
  bot.on('message', (ctx) => handlers.messageHandler.handle(ctx, DateTime.utc()));
}
