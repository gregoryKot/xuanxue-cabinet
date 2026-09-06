// Фейковый TelegramClientFactory для e2e без сети (channels.e2e-spec.ts) —
// подменяется через `overrides` createTestApp() (create-app.ts), сеть не
// трогаем (CLAUDE.md «Тесты»). Реализует только `callApi` — единственный
// метод, которым пользуется TelegramAdapter (telegram-client.ts).
import type { TelegramClientFactory } from '../../src/channels/telegram-client';

export interface FakeTelegramClient {
  factory: TelegramClientFactory;
  sentCalls: Array<{ chatId: string; text: string }>;
}

interface CallApiPayload {
  chat_id: string;
  text?: string;
}

/** `chat_id === failingChatId` — адаптер получает ошибку с `botToken` внутри
 * текста (проверка scrub в channels.e2e-spec.ts), остальные chatId — успех. */
export function createFakeTelegramClient(
  botToken: string,
  failingChatId: string,
): FakeTelegramClient {
  const sentCalls: FakeTelegramClient['sentCalls'] = [];
  const factory: TelegramClientFactory = () =>
    ({
      callApi: (method: string, payload: CallApiPayload) => {
        if (method !== 'sendMessage') return Promise.resolve({ message_id: 2 });
        sentCalls.push({ chatId: payload.chat_id, text: payload.text ?? '' });
        if (payload.chat_id === failingChatId) {
          return Promise.reject(
            Object.assign(new Error(`Forbidden: bot${botToken} not admin`), {
              code: 403,
            }),
          );
        }
        return Promise.resolve({ message_id: 1 });
      },
    }) as unknown as ReturnType<TelegramClientFactory>;

  return { factory, sentCalls };
}
