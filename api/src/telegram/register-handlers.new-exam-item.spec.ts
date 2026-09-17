// Два входа в screen 1 диалога «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12):
// латинское /newquestion (Telegram показывает в меню команд, bot-commands.ts)
// и кириллическое /вопрос через hears() (entity 'bot_command' кириллицу не
// разбирает, register-handlers.ts) — тот же приём, что у /exams и /экзамены
// (register-handlers.exams.spec.ts). Сеть не трогаем: фабрика Telegraf
// подменена (test-support/telegraf-factory.ts).
import type { CallbackQueryHandler } from './handlers/callback-query.handler';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { ExamCommandHandler } from './handlers/exam-command.handler';
import type { MenuCommandHandler } from './handlers/menu-command.handler';
import type { MessageHandler } from './handlers/message.handler';
import type { NewExamCommandHandler } from './handlers/new-exam-command.handler';
import type { NewExamItemCommandHandler } from './handlers/new-exam-item-command.handler';
import type { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import type { StartHandler } from './handlers/start.handler';
import type { TopicCommandHandler } from './handlers/topic-command.handler';
import { BotIdentityService } from './bot-identity.service';
import { botCommandUpdate } from './test-support/bot-command-update';
import {
  TOKEN,
  fakeConfig,
  fakeHandler,
  fakeHandlerWithNow,
  topicCommandUpdate,
} from './test-support/bot-service.fixtures';
import { createFakeTelegrafFactory } from './test-support/telegraf-factory';
import { TelegramBotService } from './telegram-bot.service';

function buildService(): {
  service: TelegramBotService;
  newExamItem: ReturnType<typeof fakeHandlerWithNow>;
  message: ReturnType<typeof fakeHandlerWithNow>;
} {
  const newExamItem = fakeHandlerWithNow();
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
    fakeHandlerWithNow() as unknown as ExamCommandHandler,
    newExamItem as unknown as NewExamItemCommandHandler,
    fakeHandlerWithNow() as unknown as NewExamCommandHandler,
    new BotIdentityService(),
  );
  service.onApplicationBootstrap();
  return { service, newExamItem, message };
}

describe('registerHandlers — новый вопрос', () => {
  it('/newquestion роутится в NewExamItemCommandHandler со свежим DateTime.utc()', async () => {
    const { service, newExamItem, message } = buildService();

    await service.handleUpdate(botCommandUpdate('/newquestion', 30));

    expect(newExamItem.handle).toHaveBeenCalledTimes(1);
    expect(newExamItem.handle.mock.calls[0]?.[1]?.isValid).toBe(true);
    expect(message.handle).not.toHaveBeenCalled();
  });

  it.each(['/вопрос', '/вопрос@xuanxue_bot'])(
    '%s роутится в NewExamItemCommandHandler',
    async (text) => {
      const { service, newExamItem } = buildService();

      await service.handleUpdate(topicCommandUpdate(text));

      expect(newExamItem.handle).toHaveBeenCalledTimes(1);
    },
  );

  it('похожее слово — не команда, уходит в MessageHandler', async () => {
    const { service, newExamItem, message } = buildService();

    await service.handleUpdate(topicCommandUpdate('/вопросы'));

    expect(newExamItem.handle).not.toHaveBeenCalled();
    expect(message.handle).toHaveBeenCalledTimes(1);
  });
});
