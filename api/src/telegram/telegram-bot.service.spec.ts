// handleUpdate тестируется прямым вызовом с JSON-апдейтом (по образцу
// документации Telegram) — реальная маршрутизация Telegraf, хендлеры
// подменены jest.fn() (их собственная логика — в спеках хендлеров рядом с
// кодом, с настоящей Mongo). Сеть не трогаем: test-support/telegraf-factory.ts.
import type { Update } from 'telegraf/types';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { StartHandler } from './handlers/start.handler';
import {
  CHAT_MEMBER_UPDATE,
  START_UPDATE,
  TOKEN,
  fakeConfig,
  fakeHandler,
} from './test-support/bot-service.fixtures';
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
    );
    service.onApplicationBootstrap();

    await expect(
      service.handleUpdate(body as unknown as Update),
    ).resolves.toBeUndefined();
  });
});
