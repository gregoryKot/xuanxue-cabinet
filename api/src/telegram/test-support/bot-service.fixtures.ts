// Общие заготовки для спеков TelegramBotService (маршрутизация и старт):
// один токен-заглушка, ожидание fire-and-forget промисов bootstrap, фейки
// конфига и хендлеров, апдейты по образцу документации Telegram. Вынесены,
// чтобы два спека не дублировали блок (jscpd) и укладывались в 300 строк.
import type { ConfigService } from '@nestjs/config';
import type { Context } from 'telegraf';
import type { Update } from 'telegraf/types';
import type { CallbackQueryHandler } from '../handlers/callback-query.handler';
import type { MessageHandler } from '../handlers/message.handler';

export const TOKEN = '123456:test-token-not-real-0000000000';

// Ждём, пока разрешатся все текущие микрозадачи и очередная задача цикла
// событий — fire-and-forget промисы bootstrap (ensureBotInfo/registerWebhook)
// успевают дойти до своего .catch() до следующей проверки.
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

export function fakeHandler(): { handle: jest.Mock<Promise<void>, [Context]> } {
  return { handle: jest.fn<Promise<void>, [Context]>().mockResolvedValue(undefined) };
}

/** callback_query/message-хендлеры — маршрутизацию каждого из них проверяют
 * свои спеки рядом с кодом; здесь достаточно заглушки, чтобы TelegramBotService
 * собирался в спеках маршрутизации my_chat_member/start. */
export function fakeExtraHandlers(): [CallbackQueryHandler, MessageHandler] {
  return [
    fakeHandler() as unknown as CallbackQueryHandler,
    fakeHandler() as unknown as MessageHandler,
  ];
}

// Апдейт из документации Telegram (my_chat_member: бот добавлен в группу).
export const CHAT_MEMBER_UPDATE = {
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

export const START_UPDATE = {
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
