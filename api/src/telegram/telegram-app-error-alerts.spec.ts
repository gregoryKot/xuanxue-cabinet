// Юнит без Mongo (CLAUDE.md «Тесты»): обе зависимости — PersonalChats и
// TelegramBotService — фейки, сервис сам ничего не читает из базы. Текст
// сообщения — app-error-alert-message.spec.ts, здесь только дедуп, потолок
// и адресация.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { NotificationKind } from '@xuanxue/shared';
import type { AppErrorAlertContext } from '../common/app-error-alerts';
import type { PersonalChat } from './personal-chats';
import { TelegramAppErrorAlerts } from './telegram-app-error-alerts';
import type { TelegramBotService } from './telegram-bot.service';

const NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });
const CHAT: PersonalChat = { chatId: '111', userId: 'u1', name: 'Дима' };

function fakePersonalChats(chats: PersonalChat[] = [CHAT]): {
  listFor: jest.Mock<Promise<PersonalChat[]>, [NotificationKind, DateTime]>;
} {
  return {
    listFor: jest
      .fn<Promise<PersonalChat[]>, [NotificationKind, DateTime]>()
      .mockResolvedValue(chats),
  };
}

function fakeBot(): {
  sendMessage: jest.Mock<Promise<boolean>, [string, string, unknown[][]?]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<boolean>, [string, string, unknown[][]?]>()
      .mockResolvedValue(true),
  };
}

function buildAlerts(
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
  );
  return { alerts, personalChats, bot };
}

function fakeContext(
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

describe('TelegramAppErrorAlerts.notifyServerError', () => {
  it("шлёт всем из listFor('app_error')", async () => {
    const chats = [CHAT, { chatId: '222', userId: 'u2', name: 'Мария' }];
    const { alerts, personalChats, bot } = buildAlerts(fakePersonalChats(chats));

    await alerts.notifyServerError(fakeContext(), NOW);

    expect(personalChats.listFor).toHaveBeenCalledWith('app_error', NOW);
    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
    expect(bot.sendMessage.mock.calls.map((call) => call[0])).toEqual(['111', '222']);
  });

  it('нет ни одного чата — logger.error, не падает', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, bot } = buildAlerts(fakePersonalChats([]));

    await expect(alerts.notifyServerError(fakeContext(), NOW)).resolves.toBeUndefined();

    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('та же сигнатура (метод+путь) в пределах 10 минут — второй раз не уходит', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyServerError(fakeContext(), NOW);
    await alerts.notifyServerError(fakeContext(), NOW.plus({ minutes: 5 }));

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('через 11 минут та же сигнатура уходит снова', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyServerError(fakeContext(), NOW);
    await alerts.notifyServerError(fakeContext(), NOW.plus({ minutes: 11 }));

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('разные сигнатуры (другой путь) не делят дедуп', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyServerError(fakeContext({ path: '/api/a' }), NOW);
    await alerts.notifyServerError(
      fakeContext({ path: '/api/b' }),
      NOW.plus({ minutes: 1 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('потолок 6 сообщений в час — седьмая разная сигнатура в тот же час не уходит', async () => {
    const { alerts, bot } = buildAlerts();

    for (let i = 0; i < 6; i += 1) {
      await alerts.notifyServerError(
        fakeContext({ path: `/api/${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyServerError(
      fakeContext({ path: '/api/7' }),
      NOW.plus({ minutes: 6 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(6);
  });

  it('потолок исчерпан — сообщение в лог один раз, не на каждый следующий сбой', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts } = buildAlerts();

    for (let i = 0; i < 6; i += 1) {
      await alerts.notifyServerError(
        fakeContext({ path: `/api/${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyServerError(
      fakeContext({ path: '/api/7' }),
      NOW.plus({ minutes: 6 }),
    );
    await alerts.notifyServerError(
      fakeContext({ path: '/api/8' }),
      NOW.plus({ minutes: 7 }),
    );

    const capMessages = error.mock.calls.filter((call) =>
      String(call[0]).includes('потолок'),
    );
    expect(capMessages).toHaveLength(1);
    error.mockRestore();
  });

  it('новый час — потолок снова доступен', async () => {
    const { alerts, bot } = buildAlerts();

    for (let i = 0; i < 6; i += 1) {
      await alerts.notifyServerError(
        fakeContext({ path: `/api/${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyServerError(
      fakeContext({ path: '/api/7' }),
      NOW.plus({ minutes: 61 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(7);
  });
});
