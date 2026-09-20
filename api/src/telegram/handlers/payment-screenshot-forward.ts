// Пересылка скриншота оплаты бухгалтеру (ADR-0050, docs/PLAN.md §15 слой
// 2.2) — вынесена из payment-screenshot-message.handler.ts (файл-лимит
// CLAUDE.md). Получатели — personalChats.listFor('payments', now) (дефолт
// роли — бухгалтер, PR #233). Механика «фото первым, подпись вторым» —
// forward-photo-with-caption.ts, общая с exam-media-forward.ts (видео
// экзамена). Некому слать (бухгалтер не подключил бота или выключил вид) —
// не падаем и не молчим: `warn` с userId и месяцем, без ПДн (SECURITY §1);
// ученику отвечаем как обычно — доставка бухгалтеру не его забота.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { formatMonthRu } from '@xuanxue/shared';
import type { PersonalChat, PersonalChats } from '../personal-chats';
import { forwardPhotoWithCaption } from './forward-photo-with-caption';

const logger = new Logger('paymentScreenshotForward');

export async function forwardPaymentScreenshotToAccountant(
  ctx: Context,
  personalChats: PersonalChats,
  studentName: string,
  studentUserId: string,
  month: string,
  now: DateTime,
): Promise<void> {
  const message = ctx.message;
  const chat = ctx.chat;
  if (!chat || !message) return;

  const chats = await personalChats.listFor('payments', now);
  if (chats.length === 0) {
    logger.warn('telegram.paymentScreenshot.forward: некому переслать', {
      userId: studentUserId,
      month,
    });
    return;
  }

  const caption = `Скриншот от ${studentName} — оплата за ${formatMonthRu(month)}.`;
  await Promise.all(
    chats.map((accountantChat: PersonalChat) =>
      forwardPhotoWithCaption(
        ctx,
        accountantChat.chatId,
        chat.id,
        message.message_id,
        caption,
        'telegram.paymentScreenshot.forward',
      ),
    ),
  );
}
