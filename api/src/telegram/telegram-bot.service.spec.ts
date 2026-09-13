// handleUpdate тестируется прямым вызовом с JSON-апдейтом (по образцу
// документации Telegram) — реальная маршрутизация Telegraf, хендлеры
// подменены jest.fn() (их собственная логика — в спеках хендлеров рядом с
// кодом, с настоящей Mongo). Сеть не трогаем: test-support/telegraf-factory.ts.
import { DateTime } from 'luxon';
import type { Update } from 'telegraf/types';
import type { CallbackQueryHandler } from './handlers/callback-query.handler';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { MessageHandler } from './handlers/message.handler';
import type { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import type { StartHandler } from './handlers/start.handler';
import type { TopicCommandHandler } from './handlers/topic-command.handler';
import {
  CALLBACK_UPDATE,
  CHAT_MEMBER_UPDATE,
  START_UPDATE,
  TEXT_MESSAGE_UPDATE,
  TOKEN,
  fakeConfig,
  fakeExtraHandlers,
  fakeHandler,
  fakeHandlerWithNow,
  topicCommandUpdate,
} from './test-support/bot-service.fixtures';
import { botCommandUpdate } from './test-support/bot-command-update';
import type { MenuCommandHandler } from './handlers/menu-command.handler';
import { createFakeTelegrafFactory } from './test-support/telegraf-factory';
import { createTelegraf } from './telegraf-instance';
import { TelegramBotService } from './telegram-bot.service';

describe('TelegramBotService — маршрутизация', () => {
  it('BOT_TOKEN не задан — бот не создаётся, handleUpdate не падает и никуда не роутит', async () => {
    const chatMember = fakeHandler();
    const start = fakeHandler();
    const service = new TelegramBotService(
      fakeConfig({}),
      createTelegraf,
      chatMember as unknown as ChatMemberHandler,
      start as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    service.onApplicationBootstrap();
    await expect(service.handleUpdate(CHAT_MEMBER_UPDATE)).resolves.toBeUndefined();

    expect(chatMember.handle).not.toHaveBeenCalled();
  });

  it('my_chat_member роутится в ChatMemberHandler с разобранным ctx', async () => {
    const chatMember = fakeHandler();
    const start = fakeHandler();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      chatMember as unknown as ChatMemberHandler,
      start as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(CHAT_MEMBER_UPDATE);

    expect(chatMember.handle).toHaveBeenCalledTimes(1);
    expect(start.handle).not.toHaveBeenCalled();
    const ctx = chatMember.handle.mock.calls[0]?.[0];
    expect(ctx?.myChatMember).toMatchObject({ chat: { id: -100555 } });
  });

  it('/start роутится в StartHandler', async () => {
    const chatMember = fakeHandler();
    const start = fakeHandler();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      chatMember as unknown as ChatMemberHandler,
      start as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(START_UPDATE);

    expect(start.handle).toHaveBeenCalledTimes(1);
    expect(chatMember.handle).not.toHaveBeenCalled();
  });

  it('ошибка внутри обработки апдейта — логируется, не выбрасывается (200 всегда)', async () => {
    const chatMember = { handle: jest.fn().mockRejectedValue(new Error('boom')) };
    const start = fakeHandler();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      chatMember as unknown as ChatMemberHandler,
      start as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();
    // Встроенный обработчик telegraf печатал бы апдейт в console.error и
    // ставил process.exitCode = 1 — ни того, ни другого быть не должно.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.handleUpdate(CHAT_MEMBER_UPDATE)).resolves.toBeUndefined();

    expect(consoleError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    consoleError.mockRestore();
  });

  it.each([
    ['пустое тело', {}],
    ['только update_id', { update_id: 1 }],
    ['message без полей', { update_id: 1, message: {} }],
  ])('минимальное/битое тело апдейта (%s) — 200 без падения', async (_label, body) => {
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();

    await expect(
      service.handleUpdate(body as unknown as Update),
    ).resolves.toBeUndefined();
  });

  it('callback_query роутится в CallbackQueryHandler со свежим DateTime.utc()', async () => {
    const callbackQuery = fakeHandlerWithNow();
    const message = fakeHandlerWithNow();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      callbackQuery as unknown as CallbackQueryHandler,
      fakeHandler() as unknown as TopicCommandHandler,
      fakeHandler() as unknown as NotificationsCommandHandler,
      fakeHandler() as unknown as MenuCommandHandler,
      message as unknown as MessageHandler,
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(CALLBACK_UPDATE);

    expect(callbackQuery.handle).toHaveBeenCalledTimes(1);
    expect(message.handle).not.toHaveBeenCalled();
    const [ctx, now] = callbackQuery.handle.mock.calls[0] ?? [];
    expect(ctx?.callbackQuery).toMatchObject({ data: 'cancel:000000000000000000000000' });
    expect(now).toBeInstanceOf(DateTime);
  });

  it.each([
    ['/тема', 5],
    ['/тема@bot', 6],
  ])(
    '%s роутится в TopicCommandHandler со свежим DateTime.utc(), не в MessageHandler',
    async (text, updateId) => {
      const topicCommand = fakeHandlerWithNow();
      const message = fakeHandlerWithNow();
      const { factory } = createFakeTelegrafFactory();
      const service = new TelegramBotService(
        fakeConfig({ BOT_TOKEN: TOKEN }),
        factory,
        fakeHandler() as unknown as ChatMemberHandler,
        fakeHandler() as unknown as StartHandler,
        fakeHandlerWithNow() as unknown as CallbackQueryHandler,
        topicCommand as unknown as TopicCommandHandler,
        fakeHandler() as unknown as NotificationsCommandHandler,
        fakeHandler() as unknown as MenuCommandHandler,
        message as unknown as MessageHandler,
      );
      service.onApplicationBootstrap();

      await service.handleUpdate(topicCommandUpdate(text, updateId));

      expect(topicCommand.handle).toHaveBeenCalledTimes(1);
      expect(message.handle).not.toHaveBeenCalled();
      const [, now] = topicCommand.handle.mock.calls[0] ?? [];
      expect(now).toBeInstanceOf(DateTime);
    },
  );

  it.each([
    ['/уведомления', 7],
    ['/уведомления@bot', 8],
  ])(
    '%s роутится в NotificationsCommandHandler со свежим DateTime.utc(), не в MessageHandler',
    async (text, updateId) => {
      const notificationsCommand = fakeHandlerWithNow();
      const message = fakeHandlerWithNow();
      const { factory } = createFakeTelegrafFactory();
      const service = new TelegramBotService(
        fakeConfig({ BOT_TOKEN: TOKEN }),
        factory,
        fakeHandler() as unknown as ChatMemberHandler,
        fakeHandler() as unknown as StartHandler,
        fakeHandlerWithNow() as unknown as CallbackQueryHandler,
        fakeHandler() as unknown as TopicCommandHandler,
        notificationsCommand as unknown as NotificationsCommandHandler,
        fakeHandler() as unknown as MenuCommandHandler,
        message as unknown as MessageHandler,
      );
      service.onApplicationBootstrap();

      await service.handleUpdate(topicCommandUpdate(text, updateId));

      expect(notificationsCommand.handle).toHaveBeenCalledTimes(1);
      expect(message.handle).not.toHaveBeenCalled();
      const [, now] = notificationsCommand.handle.mock.calls[0] ?? [];
      expect(now).toBeInstanceOf(DateTime);
    },
  );

  it('/темы (похожее слово, не команда) — роутится в MessageHandler, не в TopicCommandHandler', async () => {
    const topicCommand = fakeHandlerWithNow();
    const message = fakeHandlerWithNow();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      fakeHandlerWithNow() as unknown as CallbackQueryHandler,
      topicCommand as unknown as TopicCommandHandler,
      fakeHandler() as unknown as NotificationsCommandHandler,
      fakeHandler() as unknown as MenuCommandHandler,
      message as unknown as MessageHandler,
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(topicCommandUpdate('/темы'));

    expect(message.handle).toHaveBeenCalledTimes(1);
    expect(topicCommand.handle).not.toHaveBeenCalled();
  });

  it('текстовое сообщение роутится в MessageHandler со свежим DateTime.utc()', async () => {
    const callbackQuery = fakeHandlerWithNow();
    const message = fakeHandlerWithNow();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      callbackQuery as unknown as CallbackQueryHandler,
      fakeHandler() as unknown as TopicCommandHandler,
      fakeHandler() as unknown as NotificationsCommandHandler,
      fakeHandler() as unknown as MenuCommandHandler,
      message as unknown as MessageHandler,
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(TEXT_MESSAGE_UPDATE);

    expect(message.handle).toHaveBeenCalledTimes(1);
    expect(callbackQuery.handle).not.toHaveBeenCalled();
    const [ctx, now] = message.handle.mock.calls[0] ?? [];
    expect(ctx?.message).toMatchObject({ text: 'новая тема занятия' });
    expect(now).toBeInstanceOf(DateTime);
  });
});

describe('TelegramBotService.sendMessage — проактивная отправка', () => {
  it('без бота (BOT_TOKEN не задан) — молча ничего не делает', async () => {
    const service = new TelegramBotService(
      fakeConfig({}),
      createTelegraf,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();

    await expect(service.sendMessage('111', 'Привет')).resolves.toBeUndefined();
  });

  it('с ботом — уходит через callApi("sendMessage")', async () => {
    const { factory, sendMessageCalls } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();

    await service.sendMessage('111', 'Привет', [
      [{ text: 'Отменить', callback_data: 'cancel:1' }],
    ]);

    expect(sendMessageCalls).toEqual([
      {
        chatId: '111',
        text: 'Привет',
        replyMarkup: {
          inline_keyboard: [[{ text: 'Отменить', callback_data: 'cancel:1' }]],
        },
      },
    ]);
  });

  it('сбой сети — не бросает, только warn в лог', async () => {
    const { factory } = createFakeTelegrafFactory({ failSendMessage: true });
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );
    service.onApplicationBootstrap();

    await expect(service.sendMessage('111', 'Привет')).resolves.toBeUndefined();
  });

  // `/topic@имя_бота` Telegraf сверяет с настоящим username бота — в фейке он
  // свой, поэтому проверяем голую команду; форму с @ покрывают спеки
  // кириллических `/тема@bot` выше (там сверка идёт регэкспом).
  it('/topic — латинская команда роутится в TopicCommandHandler', async () => {
    const topicCommand = fakeHandlerWithNow();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      fakeHandlerWithNow() as unknown as CallbackQueryHandler,
      topicCommand as unknown as TopicCommandHandler,
      fakeHandler() as unknown as NotificationsCommandHandler,
      fakeHandler() as unknown as MenuCommandHandler,
      fakeHandlerWithNow() as unknown as MessageHandler,
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(botCommandUpdate('/topic', 15));

    expect(topicCommand.handle).toHaveBeenCalledTimes(1);
  });

  it('/notifications — латинская команда роутится в NotificationsCommandHandler', async () => {
    const notifications = fakeHandlerWithNow();
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      fakeHandlerWithNow() as unknown as CallbackQueryHandler,
      fakeHandler() as unknown as TopicCommandHandler,
      notifications as unknown as NotificationsCommandHandler,
      fakeHandler() as unknown as MenuCommandHandler,
      fakeHandlerWithNow() as unknown as MessageHandler,
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(botCommandUpdate('/notifications', 17));

    expect(notifications.handle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/menu', 'showMenu'],
    ['/schedule', 'showSchedule'],
    ['/help', 'showHelp'],
  ])('%s роутится в MenuCommandHandler', async (text, method) => {
    const menu = {
      showMenu: jest.fn().mockResolvedValue(undefined),
      showSchedule: jest.fn().mockResolvedValue(undefined),
      showHelp: jest.fn().mockResolvedValue(undefined),
    };
    const { factory } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      fakeHandlerWithNow() as unknown as CallbackQueryHandler,
      fakeHandler() as unknown as TopicCommandHandler,
      fakeHandler() as unknown as NotificationsCommandHandler,
      menu as unknown as MenuCommandHandler,
      fakeHandlerWithNow() as unknown as MessageHandler,
    );
    service.onApplicationBootstrap();

    await service.handleUpdate(botCommandUpdate(text, 21));

    expect(menu[method as keyof typeof menu]).toHaveBeenCalledTimes(1);
  });
});
