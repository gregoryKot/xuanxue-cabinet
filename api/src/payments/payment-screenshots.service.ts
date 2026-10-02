// Приём снимка перевода из кабинета (ADR-0050, docs/PLAN.md §15 слой 2.2) —
// запасной путь для того, чей Telegram с кабинетом не связан. Владение — по
// `userId` из сессии (SECURITY §3): месяц в пути говорит только «за какой
// месяц», чей он — решает сессия, и чужой снимок этим маршрутом не тронуть.
//
// Байты и `file_id` наружу не идут ни одним полем: ответ — тот же
// `MyPaymentDto`, что у `GET /me/payments` (CLAUDE.md «API»: документ
// Mongoose наружу не возвращается).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  PAYMENT_SCREENSHOT_IN_TELEGRAM_MESSAGE,
  PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
  STUDENT_MODE_PAYMENT_MESSAGE,
  type ExamImageContentType,
  type MyPaymentDto,
} from '@xuanxue/shared';
// Разбор сырого тела — тот же, что у картинок вариантов ответа
// (CLAUDE.md «Одна механика — один компонент»): формат по сигнатуре байтов,
// не по заголовку, и тот же потолок в 1 МБ (SECURITY §4).
import { parseExamImageUpload } from '../exam-images/exam-image-upload';
import { ForbiddenError, InvalidInputError, NotFoundError } from '../common/errors';
import { binaryToBuffer } from '../common/binary-to-buffer';
import { assertObjectId } from '../common/object-id';
import { SettingsService } from '../settings/settings.service';
import type { UserLean } from '../users/users.service';
import { decryptBytes, encryptBytes } from '../utils/encryption-bytes';
import { deliverUploadedScreenshot } from './deliver-uploaded-screenshot';
import { assertMonthKey } from './payment-month';
import {
  isPaymentMonthInWindow,
  PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE,
} from './payment-month-window';
import { PaymentScreenshotDeliveryRegistry } from './payment-screenshot-delivery.registry';
import {
  attachUploadedScreenshot,
  type AttachedScreenshot,
} from './payment-screenshot.write';
import { PaymentScreenshotRecord } from './payment-screenshot.schema';
import { toMyPaymentDto } from './payment.mapper';
import { PaymentRecord } from './payment.schema';

export interface LoadedPaymentScreenshot {
  bytes: Buffer;
  contentType: ExamImageContentType;
}

@Injectable()
export class PaymentScreenshotsService {
  private readonly logger = new Logger(PaymentScreenshotsService.name);

  constructor(
    @InjectModel(PaymentScreenshotRecord.name)
    private readonly model: Model<PaymentScreenshotRecord>,
    @InjectModel(PaymentRecord.name)
    private readonly paymentModel: Model<PaymentRecord>,
    private readonly settingsService: SettingsService,
    private readonly deliveryRegistry: PaymentScreenshotDeliveryRegistry,
  ) {}

  /** После привязки снимок уходит бухгалтеру в Telegram (ADR-0156) — уже
   * после того, как запись оплаты и байты на месте: доставка не может ни
   * откатить загрузку, ни уронить ответ (deliver-uploaded-screenshot.ts). */
  async upload(
    body: unknown,
    user: Pick<UserLean, 'id' | 'name' | 'studentMode'>,
    month: string,
    now: DateTime,
  ): Promise<MyPaymentDto> {
    // Режим ученика (ADR-0163): снимок ушёл бы бухгалтеру как настоящий.
    if (user.studentMode) throw new ForbiddenError(STUDENT_MODE_PAYMENT_MESSAGE);
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

    let attached: AttachedScreenshot;
    try {
      attached = await attachUploadedScreenshot(
        this.paymentModel,
        user.id,
        month,
        created._id,
        now,
      );
      if (attached.previousImageId) {
        await this.model.deleteOne({ _id: attached.previousImageId });
      }
    } catch (err) {
      // Оплата не обновилась — байты остались бы без ссылки на себя, а
      // уборщик ходит ОТ записи оплаты (ADR-0050) и такую сироту не нашёл бы
      // никогда: снимаем их сразу, тем же запросом, который и упал.
      await this.model.deleteOne({ _id: created._id });
      throw err;
    }
    await deliverUploadedScreenshot(this.deliveryRegistry, this.logger, {
      studentUserId: user.id,
      studentName: user.name,
      month,
      replaced: attached.replaced,
      bytes,
      contentType,
      now,
    });
    return toMyPaymentDto(attached.payment);
  }

  /** Снимок, загруженный в кабинете, для бухгалтера и админа (ADR-0149).
   * Байты расшифровываются на лету. Снимок бота отдать нечем — у нас только
   * file_id (ADR-0050): отвечаем 404 с текстом, где он лежит. Осиротевшая
   * ссылка (байты убрал уборщик) — тот же 404, что «снимка нет». */
  async load(userId: string, month: string): Promise<LoadedPaymentScreenshot> {
    assertMonthKey(month);
    assertObjectId(userId, PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE);
    const payment = await this.paymentModel
      .findOne({ userId, month })
      .lean<Pick<PaymentRecord, 'screenshotKind' | 'screenshotImageId'> | null>();
    if (!payment?.screenshotKind) {
      throw new NotFoundError(PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE);
    }
    if (payment.screenshotKind === 'telegram') {
      throw new NotFoundError(PAYMENT_SCREENSHOT_IN_TELEGRAM_MESSAGE);
    }
    const doc = payment.screenshotImageId
      ? await this.model.findById(payment.screenshotImageId).lean()
      : null;
    if (!doc) throw new NotFoundError(PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE);
    return {
      bytes: decryptBytes(binaryToBuffer(doc.bytes)),
      contentType: doc.contentType,
    };
  }
}
