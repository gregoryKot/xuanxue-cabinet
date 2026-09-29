// Порт доставки снимка, загруженного в кабинете, бухгалтеру (ADR-0156).
// PaymentsModule не может импортировать TelegramModule: тот сам импортирует
// PaymentsModule (бот привязывает снимки оплат), и обратный импорт закольцевал
// бы граф (eslint import-x/no-cycle, CLAUDE.md «Слои»). Интерфейс живёт здесь,
// у того, кто вызывает; реализация — telegram/telegram-payment-screenshot-delivery.ts,
// кладёт себя в PaymentScreenshotDeliveryRegistry при подъёме TelegramModule
// (тот же приём, что exam-video-delivery.port.ts у MediaModule).
import type { DateTime } from 'luxon';
import type { ExamImageContentType } from '@xuanxue/shared';

export interface UploadedScreenshotDelivery {
  studentUserId: string;
  /** Только для подписи под снимком — в лог не идёт (SECURITY §1). */
  studentName: string;
  month: string;
  /** Снимок за этот месяц уже был — подпись скажет «взамен прежнего». */
  replaced: boolean;
  /** Расшифрованные байты: в Telegram снимок из кабинета уходит файлом, а не
   * по file_id — у нас он не из Telegram (ADR-0050). */
  bytes: Buffer;
  contentType: ExamImageContentType;
  now: DateTime;
}

export interface PaymentScreenshotDeliveryPort {
  /** Не бросает: сбой доставки — дело реализации (лог, лента бухгалтера), а не
   * ученика, чья загрузка уже удалась. */
  deliverUploaded(input: UploadedScreenshotDelivery): Promise<void>;
}
