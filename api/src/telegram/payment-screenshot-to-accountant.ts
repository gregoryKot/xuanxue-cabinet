// Снимок перевода — бухгалтеру в Telegram (ADR-0050, ADR-0156, docs/PLAN.md
// §15 слой 2.2). Один класс на оба пути: ученик прислал снимок боту (вложение
// — копия его сообщения) или загрузил в кабинете (вложение — байты файлом);
// откуда вложение, знает вызывающий код и передаёт `sendAttachment`, а
// получатели, подпись, порядок «вложение, потом подпись» и разбор отказов —
// здесь, чтобы пути не разъезжались («одна механика — один компонент»).
// Механика отправки — handlers/attachment-with-caption.ts, общая с видео
// экзамена.
//
// Получатели — `personalChats.listFor('payments', now)`: бухгалтер, подключивший
// бота и не выключивший вид. Тихий отказ — самая дорогая ошибка в продукте про
// рассылки (CLAUDE.md «Логи»), поэтому у него два следа:
//   • некому слать / не дошло НИКОМУ — лог с `{ userId, month }` (без имени
//     ученика и ПДн, SECURITY §1) И строка в ленте кабинета у каждого
//     бухгалтера: бухгалтер мог не подключить бота или выключить вид именно
//     поэтому, и лента — последнее место, где он снимок ещё увидит (ADR-0156);
//   • дошло хотя бы одному — без error и без ленты: снимок у бухгалтера уже
//     есть, сбой одного из адресатов остаётся warn-ом в attachment-with-caption.ts.
// Ученику ничего из этого не возвращается: доставка бухгалтеру не его забота,
// его загрузка или сообщение боту уже удались. Метод не бросает.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { Telegram } from 'telegraf';
import { errorMessage, errorStack } from '../common/error-info';
import { writeToRoleHolders } from '../notifications/in-app-role-holders-write';
import { NotificationRecord } from '../notifications/notification.schema';
import { paymentScreenshotCaption } from '../payments/payment-screenshot-caption';
import { UsersService } from '../users/users.service';
import {
  sendAttachmentWithCaption,
  type AttachmentSender,
} from './handlers/attachment-with-caption';
import { PersonalChats } from './personal-chats';

const LOG_LABEL = 'telegram.paymentScreenshot.deliver';

export interface PaymentScreenshotToAccountantInput {
  studentUserId: string;
  /** Только для подписи — в лог не идёт. */
  studentName: string;
  month: string;
  /** Снимок за месяц уже был — подпись скажет «взамен прежнего». */
  replaced: boolean;
  sendAttachment: AttachmentSender;
  now: DateTime;
}

@Injectable()
export class PaymentScreenshotToAccountant {
  private readonly logger = new Logger(PaymentScreenshotToAccountant.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly usersService: UsersService,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
  ) {}

  /** `telegram === null` — бот не запущен (нет BOT_TOKEN): не дошло никому. */
  async deliver(
    telegram: Telegram | null,
    input: PaymentScreenshotToAccountantInput,
  ): Promise<void> {
    try {
      await this.deliverOrThrow(telegram, input);
    } catch (err) {
      this.logger.error(`${LOG_LABEL}: ${errorMessage(err)}`, errorStack(err));
    }
  }

  private async deliverOrThrow(
    telegram: Telegram | null,
    input: PaymentScreenshotToAccountantInput,
  ): Promise<void> {
    const key = { userId: input.studentUserId, month: input.month };
    const chats = await this.personalChats.listFor('payments', input.now);
    if (chats.length === 0) {
      this.logger.warn(`${LOG_LABEL}: некому отправить`, key);
      await this.writeFeedRow(input.month);
      return;
    }

    const caption = paymentScreenshotCaption(input);
    const results = await Promise.all(
      // async — чтобы «бота нет» был таким же обещанием, как отправка.
      chats.map(async (chat) =>
        telegram
          ? sendAttachmentWithCaption({
              telegram,
              toChatId: chat.chatId,
              sendAttachment: input.sendAttachment,
              caption,
              logLabel: LOG_LABEL,
            })
          : false,
      ),
    );
    if (results.some(Boolean)) return;

    this.logger.error(`${LOG_LABEL}: снимок не дошёл ни одному адресату`, key);
    await this.writeFeedRow(input.month);
  }

  private async writeFeedRow(month: string): Promise<void> {
    await writeToRoleHolders(this.usersService, this.notificationModel, {
      kind: 'payments',
      paymentMonth: month,
    });
  }
}
