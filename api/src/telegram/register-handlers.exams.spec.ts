// Два входа в один экран экзаменов: латинское /exams (его Telegram показывает
// в меню команд, bot-commands.ts) и кириллическое /экзамены через hears()
// (entity 'bot_command' кириллицу не разбирает, register-handlers.ts). Сеть не
// трогаем: фабрика Telegraf подменена (test-support/telegraf-factory.ts).
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { ExamCommandHandler } from './handlers/exam-command.handler';
import type { StartHandler } from './handlers/start.handler';
import type { MessageHandler } from './handlers/message.handler';
import type { CallbackQueryHandler } from './handlers/callback-query.handler';
import type { MenuCommandHandler } from './handlers/menu-command.handler';
import type { NewExamCommandHandler } from './handlers/new-exam-command.handler';
import type { NewExamItemCommandHandler } from './handlers/new-exam-item-command.handler';
import type { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import type { TopicCommandHandler } from './handlers/topic-command.handler';
import { BotIdentityService } from './bot-identity.service';
import {
  TOKEN,
  fakeConfig,
  fakeHandler,
  fakeHandlerWithNow,
  topicCommandUpdate,
} from './test-support/bot-service.fixtures';
import { botCommandUpdate } from './test-support/bot-command-update';
import { createFakeTelegrafFactory } from './test-support/telegraf-factory';
import { TelegramBotService } from './telegram-bot.service';

function buildService(): {
  service: TelegramBotService;
  exams: ReturnType<typeof fakeHandlerWithNow>;
  message: ReturnType<typeof fakeHandlerWithNow>;
} {
  const exams = fakeHandlerWithNow();
  const message = fakeHandlerWithNow();
  const { factory } = createFakeTelegrafFactory();
  const service = new TelegramBotService(
    fakeConfig({ BOT_TOKEN: TOKEN }),
    factory,
    fakeHandler() as unknown as ChatMemberHandler,
    fakeHandler() as unknown as StartHandler,
    fakeHandlerWithNow() as unknown as CallbackQueryHandler,
    fakeHandlerWithNow() as unknown as TopicCommandHandler,
    fakeHandlerWithNow() as unknown as NotificationsCommandHandler,
    fakeHandlerWithNow() as unknown as MenuCommandHandler,
    message as unknown as MessageHandler,
    exams as unknown as ExamCommandHandler,
    fakeHandlerWithNow() as unknown as NewExamItemCommandHandler,
    fakeHandlerWithNow() as unknown as NewExamCommandHandler,
    new BotIdentityService(),
  );
  service.onApplicationBootstrap();
  return { service, exams, message };
}

describe('registerHandlers — экзамены', () => {
  it('/exams роутится в ExamCommandHandler со свежим DateTime.utc()', async () => {
    const { service, exams, message } = buildService();

    await service.handleUpdate(botCommandUpdate('/exams', 20));

    expect(exams.handle).toHaveBeenCalledTimes(1);
    expect(exams.handle.mock.calls[0]?.[1]?.isValid).toBe(true);
    expect(message.handle).not.toHaveBeenCalled();
  });

  it.each(['/экзамены', '/экзамены@xuanxue_bot', '/экзамены сегодня'])(
    '%s роутится в ExamCommandHandler',
    async (text) => {
      const { service, exams } = buildService();

      await service.handleUpdate(topicCommandUpdate(text));

      expect(exams.handle).toHaveBeenCalledTimes(1);
    },
  );

  it('похожее слово — не команда, уходит в MessageHandler', async () => {
    const { service, exams, message } = buildService();

    await service.handleUpdate(topicCommandUpdate('/экзаменыx'));

    expect(exams.handle).not.toHaveBeenCalled();
    expect(message.handle).toHaveBeenCalledTimes(1);
  });
});
