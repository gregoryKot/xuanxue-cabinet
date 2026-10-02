// Юнит без Mongo (CLAUDE.md «Тесты»): обе зависимости — PersonalChats и
// TelegramBotService — фейки (test-support/app-error-alerts-fakes.ts), сервис
// сам ничего не читает из базы. Текст сообщения — app-error-alert-message.spec.ts,
// здесь только дедуп, потолок и адресация; сигнатура без идентификаторов и
// недоставка — telegram-app-error-alerts.delivery.spec.ts.
import { Logger } from '@nestjs/common';
import {
  ALERTS_CHAT as CHAT,
  ALERTS_NOW as NOW,
  buildAlerts,
  fakeClientContext,
  fakeContext,
  fakePersonalChats,
} from './test-support/app-error-alerts-fakes';

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

  // Пути вида `/api/route-N`, не `/api/N`: числовой сегмент — идентификатор,
  // и сигнатура его схлопывает в `:id` (alertSignaturePath, F65).
  it('потолок 6 сообщений в час — седьмая разная сигнатура в тот же час не уходит', async () => {
    const { alerts, bot } = buildAlerts();

    for (let i = 0; i < 6; i += 1) {
      await alerts.notifyServerError(
        fakeContext({ path: `/api/route-${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyServerError(
      fakeContext({ path: '/api/route-7' }),
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
        fakeContext({ path: `/api/route-${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyServerError(
      fakeContext({ path: '/api/route-7' }),
      NOW.plus({ minutes: 6 }),
    );
    await alerts.notifyServerError(
      fakeContext({ path: '/api/route-8' }),
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
        fakeContext({ path: `/api/route-${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyServerError(
      fakeContext({ path: '/api/route-7' }),
      NOW.plus({ minutes: 61 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(7);
  });
});

describe('TelegramAppErrorAlerts.notifyClientError', () => {
  it("шлёт тем же адресатам — listFor('app_error')", async () => {
    const { alerts, personalChats, bot } = buildAlerts();

    await alerts.notifyClientError(fakeClientContext(), NOW);

    expect(personalChats.listFor).toHaveBeenCalledWith('app_error', NOW);
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('тот же вид и адрес в пределах 10 минут — второй раз не уходит', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyClientError(fakeClientContext(), NOW);
    await alerts.notifyClientError(fakeClientContext(), NOW.plus({ minutes: 5 }));

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('другой вид на том же адресе — своя сигнатура, уходит', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyClientError(fakeClientContext({ kind: 'render' }), NOW);
    await alerts.notifyClientError(
      fakeClientContext({ kind: 'unhandled' }),
      NOW.plus({ minutes: 1 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  // Сбой в браузере на `/exams` и серверная 500 на том же адресе — разные
  // события: дедуп одного не имеет права глушить другое.
  it('сбой браузера не гасит дедупом серверную ошибку на том же пути', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyClientError(fakeClientContext({ path: '/exams' }), NOW);
    await alerts.notifyServerError(
      fakeContext({ method: 'GET', path: '/exams' }),
      NOW.plus({ minutes: 1 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  // Телефон у админа один: два независимых счётчика дали бы вдвое больший
  // будильник, чем обещано в ADR-0053.
  it('потолок часа общий с серверными ошибками', async () => {
    const { alerts, bot } = buildAlerts();

    for (let i = 0; i < 6; i += 1) {
      await alerts.notifyServerError(
        fakeContext({ path: `/api/route-${i}` }),
        NOW.plus({ minutes: i }),
      );
    }
    await alerts.notifyClientError(
      fakeClientContext({ path: '/exams' }),
      NOW.plus({ minutes: 6 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(6);
  });

  it('нет ни одного чата — logger.error, не падает', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, bot } = buildAlerts(fakePersonalChats([]));

    await expect(
      alerts.notifyClientError(fakeClientContext(), NOW),
    ).resolves.toBeUndefined();

    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
