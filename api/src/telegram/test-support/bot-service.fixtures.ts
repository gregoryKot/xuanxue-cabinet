// Общие заготовки для спеков TelegramBotService (маршрутизация и старт):
// один токен-заглушка, ожидание fire-and-forget промисов bootstrap, фейки
// конфига и хендлеров, апдейты по образцу документации Telegram. Вынесены,
// чтобы два спека не дублировали блок (jscpd) и укладывались в 300 строк.
import type { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { Update } from 'telegraf/types';
import type { CallbackQueryHandler } from '../handlers/callback-query.handler';
import type { ExamCommandHandler } from '../handlers/exam-command.handler';
import type { MenuCommandHandler } from '../handlers/menu-command.handler';
import type { MessageHandler } from '../handlers/message.handler';
import type { NotificationsCommandHandler } from '../handlers/notifications-command.handler';
import type { TopicCommandHandler } from '../handlers/topic-command.handler';

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

/** callback_query/`/тема`/message — хендлеры с сигнатурой `handle(ctx, now)`
 * (CLAUDE.md «Время»: TelegramBotService сам зовёт DateTime.utc() на каждый
 * апдейт и передаёт хендлеру). */
export function fakeHandlerWithNow(): {
  handle: jest.Mock<Promise<void>, [Context, DateTime]>;
} {
  return {
    handle: jest.fn<Promise<void>, [Context, DateTime]>().mockResolvedValue(undefined),
  };
}

/** callback_query/`/тема`/`/уведомления`/message/`/экзамены`-хендлеры —
 * маршрутизацию каждого из них (и что им приходит свежий DateTime.utc())
 * проверяют telegram-bot.service.spec.ts и register-handlers.exams.spec.ts. */
export function fakeExtraHandlers(): [
  CallbackQueryHandler,
  TopicCommandHandler,
  NotificationsCommandHandler,
  MenuCommandHandler,
  MessageHandler,
  ExamCommandHandler,
] {
  return [
    fakeHandlerWithNow() as unknown as CallbackQueryHandler,
    fakeHandlerWithNow() as unknown as TopicCommandHandler,
    fakeHandlerWithNow() as unknown as NotificationsCommandHandler,
    fakeHandlerWithNow() as unknown as MenuCommandHandler,
    fakeHandlerWithNow() as unknown as MessageHandler,
    fakeHandlerWithNow() as unknown as ExamCommandHandler,
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

// chat_member — статус человека, не бота (другой хендлер, ADR-0026 п.2).
export const CHAT_MEMBER_JOIN_UPDATE = {
  update_id: 6,
  chat_member: {
    chat: { id: -100555, type: 'group', title: 'Ученики' },
    from: { id: 10, is_bot: false, first_name: 'Дима' },
    date: 0,
    old_chat_member: { user: { id: 42, is_bot: false }, status: 'left' },
    new_chat_member: { user: { id: 42, is_bot: false }, status: 'member' },
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

// Апдейт из документации Telegram (callback_query: нажатие кнопки предпросмотра).
export const CALLBACK_UPDATE = {
  update_id: 3,
  callback_query: {
    id: 'cbq1',
    from: { id: 111, is_bot: false, first_name: 'Дима' },
    message: {
      message_id: 2,
      date: 0,
      chat: { id: 111, type: 'private', first_name: 'Дима' },
      text: 'Предпросмотр рассылки',
    },
    chat_instance: '1',
    data: 'cancel:000000000000000000000000',
  },
} as unknown as Update;

// Апдейт из документации Telegram (message: текстовое сообщение в личном чате).
export const TEXT_MESSAGE_UPDATE = {
  update_id: 4,
  message: {
    message_id: 3,
    date: 0,
    chat: { id: 111, type: 'private', first_name: 'Дима' },
    from: { id: 111, is_bot: false, first_name: 'Дима' },
    text: 'новая тема занятия',
  },
} as unknown as Update;

/** Апдейты `/тема` — маршрутизация в hears() (регэксп после кириллического
 * `\b`-бага, правка по ревью PR I2b): голая команда, с `@botname` (Telegram
 * дописывает его в группах) и похожее, но не совпадающее слово. */
export function topicCommandUpdate(text: string, updateId = 5): Update {
  return {
    update_id: updateId,
    message: {
      message_id: 4,
      date: 0,
      chat: { id: 111, type: 'private', first_name: 'Дима' },
      from: { id: 111, is_bot: false, first_name: 'Дима' },
      text,
    },
  } as unknown as Update;
}
