// Два входа в шаг 'pick' диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md
// §12): латинское /newexam (Telegram показывает в меню команд, bot-commands
// .ts) и кириллическое /экзамен через hears() (entity 'bot_command'
// кириллицу не разбирает, register-handlers.ts) — тот же приём, что у
// /newquestion и /вопрос (register-handlers.new-exam-item.spec.ts). Отдельно
// проверяем, что /экзамены (множественное число, слой 4б.2) не совпадает.
// Сеть не трогаем: фабрика Telegraf подменена (test-support/telegraf-factory.ts).
import type { CallbackQueryHandler } from './handlers/callback-query.handler';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { ExamCommandHandler } from './handlers/exam-command.handler';
import type { GradeQueueHandler } from './handlers/grade-queue.handler';
import type { MenuCommandHandler } from './handlers/menu-command.handler';
import type { MessageHandler } from './handlers/message.handler';
import type { NewExamCommandHandler } from './handlers/new-exam-command.handler';
import type { NewExamItemCommandHandler } from './handlers/new-exam-item-command.handler';
import type { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import type { StartHandler } from './handlers/start.handler';
import type { TopicCommandHandler } from './handlers/topic-command.handler';
import { BotIdentityService } from './bot-identity.service';
import type { PersonalChats } from './personal-chats';
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
  newExam: ReturnType<typeof fakeHandlerWithNow>;
  exams: ReturnType<typeof fakeHandlerWithNow>;
  message: ReturnType<typeof fakeHandlerWithNow>;
} {
  const newExam = fakeHandlerWithNow();
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
    newExam as unknown as NewExamCommandHandler,
    fakeHandlerWithNow() as unknown as GradeQueueHandler,
    new BotIdentityService(),
    { list: () => Promise.resolve([]) } as unknown as PersonalChats,
  );
  service.onApplicationBootstrap();
  return { service, newExam, exams, message };
}

describe('registerHandlers — собрать экзамен', () => {
  it('/newexam роутится в NewExamCommandHandler со свежим DateTime.utc()', async () => {
    const { service, newExam, message } = buildService();

    await service.handleUpdate(botCommandUpdate('/newexam', 30));

    expect(newExam.handle).toHaveBeenCalledTimes(1);
    expect(newExam.handle.mock.calls[0]?.[1]?.isValid).toBe(true);
    expect(message.handle).not.toHaveBeenCalled();
  });

  it.each(['/экзамен', '/экзамен@xuanxue_bot'])(
    '%s роутится в NewExamCommandHandler',
    async (text) => {
      const { service, newExam } = buildService();

      await service.handleUpdate(topicCommandUpdate(text));

      expect(newExam.handle).toHaveBeenCalledTimes(1);
    },
  );

  it('/экзамены (множественное число, слой 4б.2) — не совпадает, уходит в ExamCommandHandler', async () => {
    const { service, newExam, exams } = buildService();

    await service.handleUpdate(topicCommandUpdate('/экзамены'));

    expect(newExam.handle).not.toHaveBeenCalled();
    expect(exams.handle).toHaveBeenCalledTimes(1);
  });

  it('похожее слово — не команда, уходит в MessageHandler', async () => {
    const { service, newExam, message } = buildService();

    await service.handleUpdate(topicCommandUpdate('/экзаменатор'));

    expect(newExam.handle).not.toHaveBeenCalled();
    expect(message.handle).toHaveBeenCalledTimes(1);
  });
});
