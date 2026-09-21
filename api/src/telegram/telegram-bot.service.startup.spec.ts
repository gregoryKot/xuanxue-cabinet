// Прогрев botInfo и регистрация вебхука — fire-and-forget в bootstrap (не
// блокируют старт), поэтому спеки ждут `flush()` перед проверкой. Сеть не
// трогаем: фабрика Telegraf подменена, callApi — jest-заглушка.
import type { Telegraf } from 'telegraf';
import { BotIdentityService } from './bot-identity.service';
import { STAFF_BOT_COMMANDS, STUDENT_BOT_COMMANDS } from './bot-commands';
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
import type { PersonalChats } from './personal-chats';
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
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    service.onApplicationBootstrap();
    await flush();

    expect(webhookCalls).toEqual([
      {
        url: `https://xuanxue.su${TELEGRAM_WEBHOOK_PATH}`,
        secretToken: 'test-secret',
        allowedUpdates: ['message', 'my_chat_member', 'callback_query'],
      },
    ]);
    // Без callback_query бот не увидел бы нажатия кнопок предпросмотра
    // (PLAN.md §6) — Telegram шлёт только подписанные типы апдейтов.
    expect(webhookCalls[0]?.allowedUpdates).toContain('callback_query');
  });

  it('PUBLIC_URL с завершающим слэшем (защита в глубину — валидатор его и так запрещает) — путь без двойного слэша', async () => {
    const { factory, webhookCalls } = createFakeTelegrafFactory();
    const service = new TelegramBotService(
      fakeConfig({ ...FULL_ENV, PUBLIC_URL: 'https://xuanxue.su/' }),
      factory,
      fakeHandler() as unknown as ChatMemberHandler,
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
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await flush();
  });

  it('при старте регистрируется список команд — общему scope ученический список, штатному чату полный', async () => {
    // Регрессия 2026-09-21 (баг владельца «зашёл в бот с ученика — видны все
    // команды и для учителя»): раньше был один общий список на всех, теперь
    // общий (ученический) список не должен содержать штатные команды вроде
    // /тема, а подключённый штат получает их персонально на свой чат.
    const fake = createFakeTelegrafFactory();
    const personalChats = {
      list: () => Promise.resolve([{ chatId: '999', userId: 'u1', name: 'Тест' }]),
    } as unknown as PersonalChats;
    const service = new TelegramBotService(
      fakeConfig({ BOT_TOKEN: TOKEN }),
      fake.factory,
      fakeHandler() as unknown as ChatMemberHandler,
      fakeHandler() as unknown as StartHandler,
      fakeHandler() as unknown as CallbackQueryHandler,
      fakeHandler() as unknown as TopicCommandHandler,
      fakeHandler() as unknown as NotificationsCommandHandler,
      fakeHandler() as unknown as MenuCommandHandler,
      fakeHandler() as unknown as MessageHandler,
      fakeHandler() as unknown as ExamCommandHandler,
      fakeHandler() as unknown as NewExamItemCommandHandler,
      fakeHandler() as unknown as NewExamCommandHandler,
      fakeHandler() as unknown as GradeQueueHandler,
      new BotIdentityService(),
      personalChats,
    );

    service.onApplicationBootstrap();
    await flush();

    expect(fake.commandCalls).toEqual([
      { commands: STUDENT_BOT_COMMANDS, scope: { type: 'all_private_chats' } },
      { commands: [], scope: { type: 'default' } },
      { commands: STAFF_BOT_COMMANDS, scope: { type: 'chat', chat_id: '999' } },
    ]);
    expect(STUDENT_BOT_COMMANDS.map((c) => c.command)).not.toContain('topic');
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
      fakeHandler() as unknown as StartHandler,
      ...fakeExtraHandlers(),
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await flush();
  });
});
