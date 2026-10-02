// Продолжение telegram-app-error-alerts.spec.ts (тот на потолке
// файла-храповика): сигнатура дедупа без идентификаторов (аудит 2026-10-01,
// F65) и поведение при недоставке (F36). Фейки общие —
// test-support/app-error-alerts-fakes.ts.
import { Logger } from '@nestjs/common';
import {
  ALERTS_NOW as NOW,
  buildAlerts,
  fakeBot,
  fakeClientContext,
  fakeContext,
  fakePersonalChats,
} from './test-support/app-error-alerts-fakes';

const ATTEMPT_A = '66f1a2b3c4d5e6f7a8b9c0d1';
const ATTEMPT_B = '66f1a2b3c4d5e6f7a8b9c0d2';

// F65: один сбой у 60 учеников на PATCH /api/attempts/<id>/answers давал 60
// сигнатур и сжигал часовой потолок за секунды — владелец получал шесть
// одинаковых сообщений и дальше тишину.
describe('TelegramAppErrorAlerts — сигнатура без идентификаторов', () => {
  it('серверный сбой на том же маршруте у двух попыток — одно сообщение', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyServerError(
      fakeContext({ method: 'PATCH', path: `/api/attempts/${ATTEMPT_A}/answers` }),
      NOW,
    );
    await alerts.notifyServerError(
      fakeContext({ method: 'PATCH', path: `/api/attempts/${ATTEMPT_B}/answers` }),
      NOW.plus({ minutes: 1 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('сбой браузера на экране двух разных попыток — одно сообщение', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyClientError(
      fakeClientContext({ path: `/attempts/${ATTEMPT_A}` }),
      NOW,
    );
    await alerts.notifyClientError(
      fakeClientContext({ path: `/attempts/${ATTEMPT_B}` }),
      NOW.plus({ minutes: 1 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('в тексте сообщения id попытки остаётся — по нему ищут сбой в журнале', async () => {
    const { alerts, bot } = buildAlerts();

    await alerts.notifyServerError(
      fakeContext({ method: 'PATCH', path: `/api/attempts/${ATTEMPT_A}/answers` }),
      NOW,
    );

    expect(bot.sendMessage.mock.calls[0]?.[1]).toContain(ATTEMPT_A);
  });
});

// F36: раньше сигнатура и бюджет часа списывались до отправки, а результат
// sendMessage не читался — при Telegram 429 первое, самое важное сообщение о
// сбое терялось, и 10 минут та же сигнатура молчала.
function spyOnLoggerError(): jest.SpyInstance<void, [unknown, ...unknown[]]> {
  return jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
}

describe('TelegramAppErrorAlerts — доставка не удалась', () => {
  let error: ReturnType<typeof spyOnLoggerError>;

  beforeEach(() => {
    error = spyOnLoggerError();
  });
  afterEach(() => {
    error.mockRestore();
  });

  it('та же сигнатура через минуту уходит снова, не через десять', async () => {
    const { alerts, bot } = buildAlerts(fakePersonalChats(), fakeBot(false));

    await alerts.notifyServerError(fakeContext(), NOW);
    await alerts.notifyServerError(fakeContext(), NOW.plus({ seconds: 30 }));
    await alerts.notifyServerError(fakeContext(), NOW.plus({ minutes: 1 }));

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('бюджет часа не съедается недоставками — седьмая сигнатура ещё уходит', async () => {
    const { alerts, bot } = buildAlerts(fakePersonalChats(), fakeBot(false));

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

    expect(bot.sendMessage).toHaveBeenCalledTimes(7);
  });

  it('текст недоставленного сообщения — в error-лог', async () => {
    const { alerts } = buildAlerts(fakePersonalChats(), fakeBot(false));

    await alerts.notifyServerError(fakeContext({ requestId: 'req-lost' }), NOW);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('req-lost');
  });

  it('доставлено хотя бы одному из двух чатов — считается отправленным, дедуп 10 минут', async () => {
    const bot = fakeBot();
    bot.sendMessage.mockImplementation((chatId: string) =>
      Promise.resolve(chatId === '222'),
    );
    const chats = [
      { chatId: '111', userId: 'u1', name: 'Дима' },
      { chatId: '222', userId: 'u2', name: 'Мария' },
    ];
    const { alerts } = buildAlerts(fakePersonalChats(chats), bot);

    await alerts.notifyServerError(fakeContext(), NOW);
    await alerts.notifyServerError(fakeContext(), NOW.plus({ minutes: 5 }));

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });
});
