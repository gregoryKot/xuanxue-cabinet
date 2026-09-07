// Фейковая фабрика Telegraf для тестов — реальная маршрутизация (Composer:
// `.start()`, `.on()`, `.handleUpdate()`), сеть не трогаем (CLAUDE.md
// «Тесты»): `telegram.callApi` подменён на перехватчик — и `getMe`
// (TelegramBotService.ensureBotInfo зовёт его тем же способом, что и
// `setWebhook`), и `setWebhook` идут через один и тот же generic-метод, не
// через удобные обёртки `.getMe()`/`.setWebhook()`. Используется и
// юнит-спеком (telegram-bot.service.spec.ts), и e2e
// (telegram-webhook.e2e-spec.ts).
import { Telegraf } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import type { TelegrafFactory } from '../telegraf-instance';

const FAKE_BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: 'Xuanxue Bot',
  username: 'xuanxue_test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

interface WebhookCall {
  url: string;
  secretToken?: string;
}

interface SendMessageCall {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
}

export interface FakeTelegraf {
  factory: TelegrafFactory;
  webhookCalls: WebhookCall[];
  sendMessageCalls: SendMessageCall[];
}

/** `failSendMessage` — проактивная отправка (PreviewService и т. п.) должна
 * пережить сбой сети, не уронить тик планировщика: спеки проверяют это без
 * настоящего обрыва соединения. */
export function createFakeTelegrafFactory(
  options: { failSendMessage?: boolean } = {},
): FakeTelegraf {
  const webhookCalls: WebhookCall[] = [];
  const sendMessageCalls: SendMessageCall[] = [];
  const factory: TelegrafFactory = (token) => {
    const bot = new Telegraf(token);
    bot.telegram.callApi = ((method: string, payload?: Record<string, unknown>) => {
      if (method === 'getMe') return Promise.resolve(FAKE_BOT_INFO);
      if (method === 'setWebhook') {
        // Фейк только для тестов — оба конца вызова свои, продуктовый код
        // всегда шлёт url строкой (registerWebhook в telegram-bot.service.ts).
        webhookCalls.push({
          url: (payload?.url as string | undefined) ?? '',
          secretToken: payload?.secret_token as string | undefined,
        });
        return Promise.resolve(true);
      }
      if (method === 'sendMessage') {
        if (options.failSendMessage) return Promise.reject(new Error('сеть недоступна'));
        sendMessageCalls.push({
          chatId: String((payload?.chat_id as string | number | undefined) ?? ''),
          text: (payload?.text as string | undefined) ?? '',
          replyMarkup: payload?.reply_markup,
        });
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    }) as unknown as Telegraf['telegram']['callApi'];
    return bot;
  };
  return { factory, webhookCalls, sendMessageCalls };
}
