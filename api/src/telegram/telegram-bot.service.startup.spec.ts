// Прогрев botInfo и регистрация вебхука — fire-and-forget в bootstrap (не
// блокируют старт), поэтому спеки ждут `flush()` перед проверкой. Сеть не
// трогаем: фабрика Telegraf подменена, callApi — jest-заглушка.
import type { Telegraf } from 'telegraf';
import type { ChatMemberHandler } from './handlers/chat-member.handler';
import type { ChatMemberJoinHandler } from './handlers/chat-member-join.handler';
import type { StartHandler } from './handlers/start.handler';
import {
  CHAT_MEMBER_UPDATE,
  TOKEN,
  fakeConfig,
  fakeExtraHandlers,
  fakeHandler,
  flush,
} from './test-support/bot-service.fixtures';
import { createFakeTelegrafFactory } from './test-support/telegraf-factory';
import { createTelegraf, type TelegrafFactory } from './telegraf-instance';
import { TelegramBotService, TELEGRAM_WEBHOOK_PATH } from './telegram-bot.service';

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
      fakeHandler() as unknown as ChatMemberJoinHandler,
      start as unknown as StartHandler,
      ...fakeExtraHandlers(),
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
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    service.onApplicationBootstrap();
    await flush();

    expect(webhookCalls).toEqual([
      {
        url: `https://xuanxue.su${TELEGRAM_WEBHOOK_PATH}`,
        secretToken: 'test-secret',
        allowedUpdates: ['message', 'my_chat_member', 'chat_member', 'callback_query'],
      },
    ]);
    // Без callback_query бот не увидел бы нажатия кнопок предпросмотра
    // (PLAN.md §6) — Telegram шлёт только подписанные типы апдейтов.
    expect(webhookCalls[0]?.allowedUpdates).toContain('callback_query');
    // Без chat_member Telegram не пришлёт апдейт о вступлении в группу учеников,
    // даже когда бот там администратор (ADR-0026 п.2, RUNBOOK §8.15).
    expect(webhookCalls[0]?.allowedUpdates).toContain('chat_member');
  });

  it('PUBLIC_URL с завершающим слэшем (защита в глубину — валидатор его и так запрещает) — путь без двойного слэша', async () => {
    const { factory, webhookCalls } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ ...FULL_ENV, PUBLIC_URL: 'https://xuanxue.su/' }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
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
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
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
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
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
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await flush();
  });

  it('при старте регистрируется список команд — меню бота не остаётся пустым', async () => {
    const fake = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      fake.factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    service.onApplicationBootstrap();
    await flush();

    expect(fake.commandCalls).toHaveLength(1);
    expect(fake.commandCalls[0]?.map((c) => c.command)).toContain('menu');
  });

  it('setMyCommands отклонён — меню без команд, но приложение поднялось', async () => {
    const factory: TelegrafFactory = (token) => {
      const bot = createTelegraf(token);
      bot.telegram.callApi = ((method: string) => {
        if (method === 'setMyCommands') return Promise.reject(new Error('сеть'));
        if (method === 'getMe') return Promise.resolve({ id: 1, is_bot: true });
        return Promise.resolve(true);
      }) as unknown as Telegraf['telegram']['callApi'];
      return bot;
    };
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as ChatMemberJoinHandler,
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await flush();
  });
});
