// handleUpdate тестируется прямым вызовом с JSON-апдейтом (по образцу
// документации Telegram) — реальная маршрутизация Telegraf, хендлеры
// подменены jest.fn() (их собственная логика — в спеках хендлеров рядом с
// кодом, с настоящей Mongo). Сеть не трогаем: test-support/telegraf-factory.ts.
// Прогрев botInfo и регистрация вебхука — fire-and-forget в bootstrap (не
// блокируют старт), поэтому спеки на них ждут `flush()` перед проверкой.
import type { ConfigService } from '@nestjs/config';
import type { Context, Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { StartHandler } from './handlers/start.handler';
import { createFakeTelegrafFactory } from './test-support/telegraf-factory';
import { createTelegraf, type TelegrafFactory } from './telegraf-instance';
import { TelegramBotService, TELEGRAM_WEBHOOK_PATH } from './telegram-bot.service';

const TOKEN = '123456:test-token-not-real-0000000000';

// Ждём, пока разрешатся все текущие микрозадачи и очередная задача цикла
// событий — fire-and-forget промисы bootstrap (ensureBotInfo/registerWebhook)
// успевают дойти до своего .catch() до следующей проверки.
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function fakeHandler(): { handle: jest.Mock<Promise<void>, [Context]> } {
  return { handle: jest.fn<Promise<void>, [Context]>().mockResolvedValue(undefined) };
}

// Апдейт из документации Telegram (my_chat_member: бот добавлен в группу).
const CHAT_MEMBER_UPDATE = {
  update_id: 1,
  my_chat_member: {
    chat: { id: -100555, type: 'group', title: 'Ученики' },
    from: { id: 10, is_bot: false, first_name: 'Дима' },
    date: 0,
    old_chat_member: {
      user: { id: 1, is_bot: true, first_name: 'Xuanxue Bot' },
      status: 'left',
    },
    new_chat_member: {
      user: { id: 1, is_bot: true, first_name: 'Xuanxue Bot' },
      status: 'member',
    },
  },
} as unknown as Update;

const START_UPDATE = {
  update_id: 2,
  message: {
    message_id: 1,
    date: 0,
    chat: { id: 111, type: 'private', first_name: 'Дима' },
    from: { id: 111, is_bot: false, first_name: 'Дима' },
    text: '/start',
    entities: [{ offset: 0, length: 6, type: 'bot_command' }],
  },
} as unknown as Update;

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

    await expect(service.handleUpdate(CHAT_MEMBER_UPDATE)).resolves.toBeUndefined();
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

describe('TelegramBotService — прогрев botInfo (ensureBotInfo)', () => {
  it('getMe отклоняется — апдейт залогирован как ошибка, следующий апдейт снова пробует getMe', async () => {
    const chatMember = fakeHandler();
    const start = fakeHandler();
    let getMeCalls = 0;
    const factory: TelegrafFactory = (token) => {
      const bot = createTelegraf(token);
      bot.telegram.callApi = ((method: string) => {
        if (method === 'getMe') {
          getMeCalls += 1;
          // Первые два вызова (прогрев в bootstrap + первый апдейт) падают,
          // третий (второй апдейт) — успешен.
          return getMeCalls <= 2
            ? Promise.reject(new Error('getMe недоступен'))
            : Promise.resolve({
                id: 1,
                is_bot: true,
                first_name: 'Bot',
                username: 'bot',
                can_join_groups: true,
                can_read_all_group_messages: false,
                supports_inline_queries: false,
              });
        }
        return Promise.resolve(undefined);
      }) as unknown as Telegraf['telegram']['callApi'];
      return bot;
    };
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      chatMember as unknown as ChatMemberHandler,
      start as unknown as StartHandler,
    );

    service.onApplicationBootstrap();
    await flush(); // прогрев (1-й getMe) успевает отклониться и залогироваться

    await service.handleUpdate(CHAT_MEMBER_UPDATE); // 2-й getMe — тоже отказ
    expect(chatMember.handle).not.toHaveBeenCalled();

    await service.handleUpdate(CHAT_MEMBER_UPDATE); // 3-й getMe — успех, повтор не пропущен
    expect(chatMember.handle).toHaveBeenCalledTimes(1);
    expect(getMeCalls).toBe(3);

    await service.handleUpdate(CHAT_MEMBER_UPDATE); // botInfo уже есть — getMe не зовём снова
    expect(getMeCalls).toBe(3);
    expect(chatMember.handle).toHaveBeenCalledTimes(2);
  });
});

describe('TelegramBotService — регистрация вебхука при старте', () => {
  const FULL_ENV = {
    BOT_TOKEN: TOKEN,
    NODE_ENV: 'production',
    PUBLIC_URL: 'https://xuanxue.su',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
  };

  it('production + PUBLIC_URL + TELEGRAM_WEBHOOK_SECRET — setWebhook с ожидаемыми параметрами', async () => {
    const { factory, webhookCalls } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig(FULL_ENV),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
    );

    service.onApplicationBootstrap();
    await flush();

    expect(webhookCalls).toEqual([
      {
        url: `https://xuanxue.su${TELEGRAM_WEBHOOK_PATH}`,
        secretToken: 'test-secret',
      },
    ]);
  });

  it('PUBLIC_URL с завершающим слэшем (защита в глубину — валидатор его и так запрещает) — путь без двойного слэша', async () => {
    const { factory, webhookCalls } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ ...FULL_ENV, PUBLIC_URL: 'https://xuanxue.su/' }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
    );

    service.onApplicationBootstrap();
    await flush();

    expect(webhookCalls[0]?.url).toBe(`https://xuanxue.su${TELEGRAM_WEBHOOK_PATH}`);
    expect(webhookCalls[0]?.url).not.toContain('//api');
  });

  it.each([
    ['NODE_ENV не production', { ...FULL_ENV, NODE_ENV: 'development' }],
    ['нет PUBLIC_URL', { ...FULL_ENV, PUBLIC_URL: '' }],
    ['нет TELEGRAM_WEBHOOK_SECRET', { ...FULL_ENV, TELEGRAM_WEBHOOK_SECRET: '' }],
  ])('%s — вебхук не регистрируется', async (_label, env) => {
    const { factory, webhookCalls } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig(env),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
    );

    service.onApplicationBootstrap();
    await flush();

    expect(webhookCalls).toHaveLength(0);
  });

  it('setWebhook никогда не резолвится — onApplicationBootstrap всё равно завершается (не блокирует старт)', () => {
    const factory: TelegrafFactory = (token) => {
      const bot = createTelegraf(token);
      bot.telegram.callApi = ((method: string) =>
        method === 'setWebhook'
          ? new Promise(() => {
              /* никогда не резолвится — имитация зависшей сети */
            })
          : Promise.resolve(undefined)) as unknown as Telegraf['telegram']['callApi'];
      return bot;
    };
    const service = new TelegramBotService(
      fakeConfig(FULL_ENV),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
    );

    // onApplicationBootstrap синхронный и ничего внутри не await'ит — вызов
    // не блокируется, даже если promise setWebhook не резолвится никогда.
    expect(() => service.onApplicationBootstrap()).not.toThrow();
  });

  it('setWebhook бросает — залогировано, onApplicationBootstrap не падает', async () => {
    const factory: TelegrafFactory = (token) => {
      const bot = createTelegraf(token);
      bot.telegram.callApi = ((method: string) =>
        method === 'setWebhook'
          ? Promise.reject(new Error('network'))
          : Promise.resolve(undefined)) as unknown as Telegraf['telegram']['callApi'];
      return bot;
    };
    const service = new TelegramBotService(
      fakeConfig(FULL_ENV),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await flush();
  });
});
