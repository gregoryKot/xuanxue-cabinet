// Юнит без Mongo и без сети (ADR-0156): реализация порта кладёт себя в реестр
// payments/ и превращает загрузку из кабинета в `sendPhoto` байтами через общий
// PaymentScreenshotToAccountant. Получатели, подпись и отказы — его spec
// (payment-screenshot-to-accountant.spec.ts); здесь только стык порта с ним.
import { DateTime } from 'luxon';
import type { Telegram } from 'telegraf';
import { PaymentScreenshotDeliveryRegistry } from '../payments/payment-screenshot-delivery.registry';
import type { UploadedScreenshotDelivery } from '../payments/payment-screenshot-delivery.port';
import type {
  PaymentScreenshotToAccountant,
  PaymentScreenshotToAccountantInput,
} from './payment-screenshot-to-accountant';
import type { TelegramBotService } from './telegram-bot.service';
import { TelegramPaymentScreenshotDelivery } from './telegram-payment-screenshot-delivery';

const NOW = DateTime.fromISO('2026-09-29T10:00:00Z');
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const INPUT: UploadedScreenshotDelivery = {
  studentUserId: 'student-1',
  studentName: 'Ирина',
  month: '2026-09',
  replaced: true,
  bytes: BYTES,
  contentType: 'image/png',
  now: NOW,
};

function setup(telegram: Telegram | null) {
  const deliver = jest.fn<
    Promise<void>,
    [Telegram | null, PaymentScreenshotToAccountantInput]
  >(() => Promise.resolve());
  const toAccountant = { deliver } as unknown as PaymentScreenshotToAccountant;
  const botService = {
    telegramClient: () => telegram,
  } as unknown as TelegramBotService;
  const registry = new PaymentScreenshotDeliveryRegistry();
  const delivery = new TelegramPaymentScreenshotDelivery(
    botService,
    toAccountant,
    registry,
  );
  return { delivery, registry, deliver };
}

/** Единственный вызов общего класса — без `!`: пустой список роняет тест
 * понятной ошибкой, а не TypeError дальше по коду. */
function onlyCall(deliver: ReturnType<typeof setup>['deliver']) {
  expect(deliver).toHaveBeenCalledTimes(1);
  const [call] = deliver.mock.calls;
  if (!call) throw new Error('deliver не вызван');
  return call;
}

describe('TelegramPaymentScreenshotDelivery', () => {
  it('при подъёме модуля кладёт себя в реестр payments/', () => {
    const { delivery, registry } = setup(null);
    expect(registry.getOrNull()).toBeNull();

    delivery.onModuleInit();

    expect(registry.getOrNull()).toBe(delivery);
  });

  it('передаёт ученика, месяц и замену как есть, клиент бота — первым аргументом', async () => {
    const telegram = { callApi: jest.fn() } as unknown as Telegram;
    const { delivery, deliver } = setup(telegram);

    await delivery.deliverUploaded(INPUT);

    const [client, input] = onlyCall(deliver);
    expect(client).toBe(telegram);
    expect(input).toMatchObject({
      studentUserId: 'student-1',
      studentName: 'Ирина',
      month: '2026-09',
      replaced: true,
      now: NOW,
    });
  });

  it('вложение — sendPhoto байтами, имя файла по месяцу и типу, с таймаутом', async () => {
    const callApi = jest.fn(() => Promise.resolve({ message_id: 1 }));
    const telegram = { callApi } as unknown as Telegram;
    const { delivery, deliver } = setup(telegram);

    await delivery.deliverUploaded(INPUT);
    const [, input] = onlyCall(deliver);
    await input.sendAttachment(telegram, '770101');

    expect(callApi).toHaveBeenCalledWith(
      'sendPhoto',
      { chat_id: '770101', photo: { source: BYTES, filename: 'screenshot-2026-09.png' } },
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    );
  });

  it('бота нет (нет BOT_TOKEN) — клиент null уходит дальше, решение за общим классом', async () => {
    const { delivery, deliver } = setup(null);

    await delivery.deliverUploaded(INPUT);

    expect(onlyCall(deliver)[0]).toBeNull();
  });
});
