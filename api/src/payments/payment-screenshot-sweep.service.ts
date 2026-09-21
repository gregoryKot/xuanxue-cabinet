// Уборщик снимков перевода (ADR-0050, чеклист CLAUDE.md «Новая коллекция»:
// у коллекции с персональными данными записан срок хранения). Дат две, и обе
// нужны: 30 дней после подтверждения — снимок своё отслужил, бухгалтер его
// уже посмотрел; 90 дней после загрузки, если подтверждения так и не
// случилось, — иначе забытая в очереди картинка живёт вечно.
//
// TTL-индекс Mongo здесь не годится (ADR-0050, «Альтернативы»): дата
// удаления зависит от статуса оплаты, а TTL умеет только «поле плюс
// константа» — пришлось бы пересчитывать её при каждом переходе статуса и
// надеяться, что ни один путь не забыл. Поэтому шаг планировщика
// (scheduler.service.ts), по образцу exam-image-sweep.service.ts: учитель и
// бухгалтер ничего не нажимают, снимки убираются сами.
//
// Уборка снимает байты и очищает поля снимка у записи оплаты. Сама оплата
// остаётся: деньги мы не забываем вместе с картинкой.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { PaymentScreenshotRecord } from './payment-screenshot.schema';
import { PaymentRecord } from './payment.schema';

export const PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS = 30;
export const PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS = 90;
// Ссылка на снимок появляется в том же запросе, что и сами байты
// (PaymentScreenshotsService.upload), поэтому сутки — с запасом: всё, что
// старше и ни одной оплатой не названо, ссылки уже не дождётся.
const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт
// остаток, тот же приём, что у соседнего шага «картинки-сироты».
const SWEEP_BATCH_LIMIT = 50;

export interface PaymentScreenshotSweepResult {
  /** Оплат, у которых снимок отслужил срок и поля сняты. */
  removed: number;
  /** Байтов, на которые не ссылается ни одна оплата, — см. removeOrphans. */
  orphans: number;
}

interface DuePayment {
  _id: Types.ObjectId;
  screenshotImageId?: Types.ObjectId;
}

@Injectable()
export class PaymentScreenshotSweepService {
  constructor(
    @InjectModel(PaymentRecord.name) private readonly paymentModel: Model<PaymentRecord>,
    @InjectModel(PaymentScreenshotRecord.name)
    private readonly screenshotModel: Model<PaymentScreenshotRecord>,
  ) {}

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeExpired(now: DateTime): Promise<PaymentScreenshotSweepResult> {
    const removed = await this.clearDuePayments(now);
    const orphans = await this.removeOrphans(now);
    return { removed, orphans };
  }

  /** Снимок отслужил срок: байты уходят, поля снимка у оплаты снимаются,
   * сама оплата остаётся. */
  private async clearDuePayments(now: DateTime): Promise<number> {
    const confirmed = now
      .minus({ days: PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS })
      .toJSDate();
    const uploaded = now
      .minus({ days: PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS })
      .toJSDate();

    const due = await this.paymentModel
      .find(
        {
          screenshotKind: { $exists: true },
          $or: [
            { status: 'paid', confirmedAt: { $lt: confirmed } },
            { status: { $ne: 'paid' }, screenshotAt: { $lt: uploaded } },
          ],
        },
        { _id: 1, screenshotImageId: 1 },
      )
      .limit(SWEEP_BATCH_LIMIT)
      .lean<DuePayment[]>();
    if (due.length === 0) return 0;

    // Байты — первыми, поля оплаты — следом: упади вторая половина, снимок
    // всё ещё числится за оплатой, и следующий тик доберёт её (повторное
    // удаление уже удалённых байтов ничего не стоит). В обратном порядке
    // байты остались бы без ссылки на себя, и найти их было бы уже нечем.
    const imageIds = due
      .map((doc) => doc.screenshotImageId)
      .filter((id): id is Types.ObjectId => id != null);
    if (imageIds.length > 0) {
      await this.screenshotModel.deleteMany({ _id: { $in: imageIds } });
    }

    const { modifiedCount } = await this.paymentModel.updateMany(
      { _id: { $in: due.map((doc) => doc._id) } },
      {
        $unset: {
          screenshotKind: '',
          screenshotFileId: '',
          screenshotFileUniqueId: '',
          screenshotImageId: '',
          screenshotAt: '',
        },
      },
    );
    return modifiedCount;
  }

  /**
   * Байты, на которые не ссылается ни одна оплата. Такие появляются там, где
   * запись оплаты не состоялась, а компенсация в сервисе не сработала (упала
   * и она), и на гонке двух одновременных загрузок одного месяца: обе видят
   * «документа нет», вторая доигрывает апдейт поверх первой, и снимок первой
   * остаётся без ссылки на себя. Без этого прохода такие байты не нашёл бы
   * никто — ни срок хранения (он считается от оплаты), ни удаление аккаунта
   * (оно идёт по `payments.screenshotImageId`, ADR-0050).
   */
  private async removeOrphans(now: DateTime): Promise<number> {
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    const candidates = await this.screenshotModel
      .find({ createdAt: { $lt: boundary } }, { _id: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean<{ _id: Types.ObjectId }[]>();
    if (candidates.length === 0) return 0;

    const ids = candidates.map((doc) => doc._id);
    const referenced = await this.paymentModel.distinct('screenshotImageId', {
      screenshotImageId: { $in: ids },
    });
    const known = new Set(referenced.map((id) => id.toString()));
    const orphans = ids.filter((id) => !known.has(id.toString()));
    if (orphans.length === 0) return 0;

    const { deletedCount } = await this.screenshotModel.deleteMany({
      _id: { $in: orphans },
    });
    return deletedCount;
  }
}
