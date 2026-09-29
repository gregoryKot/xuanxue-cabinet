// Реализация PaymentScreenshotDeliveryPort (payments/payment-screenshot-delivery.port.ts)
// поверх PaymentScreenshotToAccountant — ADR-0156: снимок, загруженный в
// кабинете, уходит бухгалтеру так же, как присланный боту. Кладёт себя в
// PaymentScreenshotDeliveryRegistry в onModuleInit — TelegramModule уже
// импортирует PaymentsModule, реестр ему доступен; обратный импорт
// payments/ → telegram/ закольцевал бы граф (комментарий в порте). Образец —
// telegram-exam-video-delivery.ts.
//
// Вложение — `sendPhoto` байтами: у снимка из кабинета нет file_id, Telegram
// его не видел (ADR-0050). Имя файла — по месяцу, не по имени ученика: оно
// уезжает в Telegram и в логи ошибок отправки.
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { telegramCallOptions } from '../channels/telegram-client';
import type {
  PaymentScreenshotDeliveryPort,
  UploadedScreenshotDelivery,
} from '../payments/payment-screenshot-delivery.port';
import { PaymentScreenshotDeliveryRegistry } from '../payments/payment-screenshot-delivery.registry';
import { CONTENT_TYPE_EXTENSION } from './handlers/exam-question-photo-send';
import { PaymentScreenshotToAccountant } from './payment-screenshot-to-accountant';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class TelegramPaymentScreenshotDelivery
  implements PaymentScreenshotDeliveryPort, OnModuleInit
{
  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly toAccountant: PaymentScreenshotToAccountant,
    private readonly registry: PaymentScreenshotDeliveryRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.set(this);
  }

  async deliverUploaded(input: UploadedScreenshotDelivery): Promise<void> {
    const filename = `screenshot-${input.month}.${CONTENT_TYPE_EXTENSION[input.contentType]}`;
    await this.toAccountant.deliver(this.telegramBotService.telegramClient(), {
      studentUserId: input.studentUserId,
      studentName: input.studentName,
      month: input.month,
      replaced: input.replaced,
      now: input.now,
      sendAttachment: (telegram, chatId) =>
        telegram.callApi(
          'sendPhoto',
          { chat_id: chatId, photo: { source: input.bytes, filename } },
          telegramCallOptions(),
        ),
    });
  }
}
