// Скриншот оплаты сообщением боту (ADR-0050, docs/PLAN.md §15 слой 2.2) —
// диспетчер message.handler.ts зовёт после /start pay_<YYYY-MM>
// (payment-screenshot-deep-link.ts), тем же приёмом, что
// ExamMediaMessageHandler для видео экзамена: личность — через
// BotUserAccessService.resolve() ещё раз (между deep link и присылкой фото
// человека могли заблокировать), владение — userId из разрешённой
// идентичности, НИКОГДА из payload ссылки (SECURITY §3). Штату абонемент не
// заводим — assertActiveStudent внутри PaymentsService.attachScreenshot
// (ADR-0026).
//
// Извлечение источника — payment-screenshot-source.ts (photo/document
// image/*, тот же приём, что exam-video-source.ts). Байты не трогаем —
// getFile не зовём вовсе, пересылка — copyMessage по file_id (ADR-0050).
//
// Пересылка бухгалтеру — payment-screenshot-forward.ts
// (personalChats.listFor('payments', now), PR #233).
//
// Свой try/catch (находка аудита PR #175, тот же приём, что у
// ExamMediaMessageHandler) — без него сбой уходил бы в общий catch
// MessageHandler, тот логирует, но ученику не отвечает.
//
// Проверка личности (denied/unknown) — resolveActiveBotUser.ts, общая с
// ExamMediaMessageHandler (jscpd: одна и та же механика в двух хендлерах).
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { formatMonthRu, type PaymentStatus } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../../common/error-info';
import { PaymentsService } from '../../payments/payments.service';
import type { BotSessionLean } from '../bot-session.lean';
import { BotSessionService } from '../bot-session.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { PersonalChats } from '../personal-chats';
import { examUserFacingError } from './exam-attempt-error';
import { PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE } from './payment-screenshot-deep-link';
import { forwardPaymentScreenshotToAccountant } from './payment-screenshot-forward';
import { extractPaymentScreenshotSource } from './payment-screenshot-source';
import { resolveActiveBotUser } from './resolve-active-bot-user';

const NOT_A_PHOTO_MESSAGE = 'Нужен скриншот: обычное фото или файл-картинка.';

function receivedMessage(month: string, status: PaymentStatus): string {
  const monthRu = formatMonthRu(month);
  return status === 'paid'
    ? `За ${monthRu} уже отмечено «Оплачено». Скриншот всё равно сохранили.`
    : `Скриншот за ${monthRu} получили. Дальше подтвердит школа — увидите отметку в кабинете.`;
}

@Injectable()
export class PaymentScreenshotMessageHandler {
  private readonly logger = new Logger(PaymentScreenshotMessageHandler.name);

  constructor(
    private readonly botSessions: BotSessionService,
    private readonly paymentsService: PaymentsService,
    private readonly botAccess: BotUserAccessService,
    private readonly personalChats: PersonalChats,
  ) {}

  async handle(
    ctx: Context,
    telegramId: number,
    session: BotSessionLean,
    now: DateTime,
  ): Promise<void> {
    if (!session.month) return; // невозможное состояние — защита в глубину
    const month = session.month;
    const source = extractPaymentScreenshotSource(ctx.message);
    if (!source) {
      await ctx.reply(NOT_A_PHOTO_MESSAGE).catch(() => null);
      return;
    }

    try {
      const user = await resolveActiveBotUser(
        ctx,
        telegramId,
        this.botAccess,
        this.botSessions,
        PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE,
        () =>
          this.logger.warn(
            `telegram.paymentScreenshot: не привязан — месяц ${month}, причина sender-unknown`,
          ),
      );
      if (!user) return;

      const status = await this.paymentsService.attachScreenshot(
        user.id,
        month,
        source,
        now,
      );
      await this.botSessions.clear(telegramId);

      await forwardPaymentScreenshotToAccountant(
        ctx,
        this.personalChats,
        user.name,
        user.id,
        month,
        now,
      );

      await ctx.reply(receivedMessage(month, status)).catch(() => null);
    } catch (err) {
      this.logger.error(
        `telegram.paymentScreenshot: ${errorMessage(err)}`,
        errorStack(err),
      );
      await ctx.reply(examUserFacingError(err)).catch(() => null);
    }
  }
}
