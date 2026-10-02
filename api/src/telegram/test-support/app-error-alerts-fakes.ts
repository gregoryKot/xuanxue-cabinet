// Фейки для спеков TelegramAppErrorAlerts — PersonalChats и TelegramBotService
// без Mongo и без сети (CLAUDE.md «Тесты»). Общие на два спека
// (telegram-app-error-alerts.spec.ts — дедуп, потолок, адресация;
// telegram-app-error-alerts.delivery.spec.ts — сигнатура без id и недоставка,
// аудит 2026-10-01 F65/F36): первый стоял на потолке файла-храповика.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { NotificationKind } from '@xuanxue/shared';
import type {
  AppErrorAlertContext,
  ClientErrorAlertContext,
} from '../../common/app-error-alerts';
import type { PersonalChat } from '../personal-chats';
import { TelegramAppErrorAlerts } from '../telegram-app-error-alerts';
import type { TelegramBotService } from '../telegram-bot.service';

export const ALERTS_NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });
export const ALERTS_CHAT: PersonalChat = { chatId: '111', userId: 'u1', name: 'Дима' };

export function fakePersonalChats(chats: PersonalChat[] = [ALERTS_CHAT]): {
  listFor: jest.Mock<Promise<PersonalChat[]>, [NotificationKind, DateTime]>;
} {
  return {
    listFor: jest
      .fn<Promise<PersonalChat[]>, [NotificationKind, DateTime]>()
      .mockResolvedValue(chats),
  };
}

/** `delivered: false` — sendMessage вернул false (Telegram 429/таймаут,
 * bot-send-safely.ts сам не бросает), по умолчанию доставка удаётся. */
export function fakeBot(delivered = true): {
  sendMessage: jest.Mock<Promise<boolean>, [string, string, unknown[][]?]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<boolean>, [string, string, unknown[][]?]>()
      .mockResolvedValue(delivered),
  };
}

// PUBLIC_URL не задан по умолчанию — тексты сообщений тестируются отдельно
// (app-error-alert-message.spec.ts); здесь важны только дедуп, потолок и
// адресация.
function fakeConfig(publicUrl?: string): ConfigService {
  return { get: () => publicUrl } as unknown as ConfigService;
}

export function buildAlerts(
  personalChats = fakePersonalChats(),
  bot = fakeBot(),
): {
  alerts: TelegramAppErrorAlerts;
  personalChats: ReturnType<typeof fakePersonalChats>;
  bot: ReturnType<typeof fakeBot>;
} {
  const alerts = new TelegramAppErrorAlerts(
    personalChats as never,
    bot as unknown as TelegramBotService,
    fakeConfig(),
  );
  return { alerts, personalChats, bot };
}

export function fakeContext(
  overrides: Partial<AppErrorAlertContext> = {},
): AppErrorAlertContext {
  return {
    requestId: 'req-1',
    method: 'POST',
    path: '/api/lessons',
    message: 'x',
    ...overrides,
  };
}

export function fakeClientContext(
  overrides: Partial<ClientErrorAlertContext> = {},
): ClientErrorAlertContext {
  return { requestId: 'req-2', kind: 'render', path: '/exams', ...overrides };
}
