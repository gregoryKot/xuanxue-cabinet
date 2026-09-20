// Приём снимка перевода из кабинета (ADR-0050, docs/PLAN.md §15 слой 2.2) —
// запасной путь для того, чей Telegram с кабинетом не связан. Владение — по
// `userId` из сессии (SECURITY §3): месяц в пути говорит только «за какой
// месяц», чей он — решает сессия, и чужой снимок этим маршрутом не тронуть.
//
// Байты и `file_id` наружу не идут ни одним полем: ответ — тот же
// `MyPaymentDto`, что у `GET /me/payments` (CLAUDE.md «API»: документ
// Mongoose наружу не возвращается).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import type { MyPaymentDto } from '@xuanxue/shared';
// Разбор сырого тела — тот же, что у картинок вариантов ответа
// (CLAUDE.md «Одна механика — один компонент»): формат по сигнатуре байтов,
// не по заголовку, и тот же потолок в 1 МБ (SECURITY §4).
import { parseExamImageUpload } from '../exam-images/exam-image-upload';
import { InvalidInputError } from '../common/errors';
import { SettingsService } from '../settings/settings.service';
import { encryptBytes } from '../utils/encryption-bytes';
import { assertMonthKey } from './payment-month';
import {
  isPaymentMonthInWindow,
  PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE,
} from './payment-month-window';
import { attachUploadedScreenshot } from './payment-screenshot.write';
import { PaymentScreenshotRecord } from './payment-screenshot.schema';
import { toMyPaymentDto } from './payment.mapper';
import { PaymentRecord } from './payment.schema';

@Injectable()
export class PaymentScreenshotsService {
  constructor(
    @InjectModel(PaymentScreenshotRecord.name)
    private readonly model: Model<PaymentScreenshotRecord>,
    @InjectModel(PaymentRecord.name)
    private readonly paymentModel: Model<PaymentRecord>,
    private readonly settingsService: SettingsService,
  ) {}

  async upload(
    body: unknown,
    userId: string,
    month: string,
    now: DateTime,
  ): Promise<MyPaymentDto> {
    assertMonthKey(month);
    // То же окно месяцев, что у ссылки бота (ADR-0050, PLAN §15): месяц
    // приезжает полем пути и подделывается так же, как payload ссылки, —
    // без окна `2099-12` завёл бы документ, который повис бы в списке у
    // бухгалтера навсегда. Проверки по месяцу — до записи байтов.
    const { tz } = await this.settingsService.get();
    if (!isPaymentMonthInWindow(month, now, tz)) {
      throw new InvalidInputError(PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE);
    }
    const { bytes, contentType } = parseExamImageUpload(body);

    const created = await this.model.create({
      bytes: encryptBytes(bytes),
      contentType,
      sizeBytes: bytes.length,
    });

    try {
      const { payment, previousImageId } = await attachUploadedScreenshot(
        this.paymentModel,
        userId,
        month,
        created._id,
        now,
      );
      if (previousImageId) await this.model.deleteOne({ _id: previousImageId });
      return toMyPaymentDto(payment);
    } catch (err) {
      // Оплата не обновилась — байты остались бы без ссылки на себя, а
      // уборщик ходит ОТ записи оплаты (ADR-0050) и такую сироту не нашёл бы
      // никогда: снимаем их сразу, тем же запросом, который и упал.
      await this.model.deleteOne({ _id: created._id });
      throw err;
    }
  }
}
