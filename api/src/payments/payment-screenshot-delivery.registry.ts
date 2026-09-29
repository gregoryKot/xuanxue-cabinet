// Реестр порта доставки снимка бухгалтеру (payment-screenshot-delivery.port.ts)
// — тот же приём инверсии, что ExamMediaNotifierRegistry (media/): провайдер
// Nest, а не переменная модуля, чтобы тесты, поднимающие по приложению на файл,
// не делили состояние. `getOrNull()`, не бросающий: доставка — побочный эффект
// после того, как снимок уже сохранён, и её отсутствие не должно ронять ответ
// ученику; вызывающий код обязан пережить `null` и сказать об этом в лог
// (deliver-uploaded-screenshot.ts).
import { Injectable } from '@nestjs/common';
import type { PaymentScreenshotDeliveryPort } from './payment-screenshot-delivery.port';

@Injectable()
export class PaymentScreenshotDeliveryRegistry {
  private port: PaymentScreenshotDeliveryPort | null = null;

  set(port: PaymentScreenshotDeliveryPort): void {
    this.port = port;
  }

  /** `null` — TelegramModule ещё не поднят или его нет в собранном приложении
   * (тест payments/ без telegram/). */
  getOrNull(): PaymentScreenshotDeliveryPort | null {
    return this.port;
  }
}
