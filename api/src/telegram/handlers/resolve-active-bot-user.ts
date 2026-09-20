// Личность отправителя перед приёмом медиа от ученика — общая механика
// ExamMediaMessageHandler (видео экзамена) и PaymentScreenshotMessageHandler
// (скриншот оплаты, ADR-0050): между deep link и присылкой файла человека
// могли заблокировать, поэтому BotUserAccessService.resolve() зовётся здесь
// второй раз (SECURITY §9). `denied` и `unknown` сами отвечают и закрывают
// ожидание — вызывающему остаётся молча выйти по `null`; `onUnknown` — для
// лога с деталями конкретного вложения (attemptId/месяц), которые этот файл
// не знает.
import type { Context } from 'telegraf';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { BotUserAccessService } from '../bot-user-access.service';

export async function resolveActiveBotUser(
  ctx: Context,
  telegramId: number,
  botAccess: BotUserAccessService,
  botSessions: BotSessionService,
  notLinkedMessage: string,
  onUnknown?: () => void,
): Promise<UserLean | null> {
  const access = await botAccess.resolve(telegramId);
  if (access.kind === 'denied') {
    await botSessions.clear(telegramId);
    await ctx.reply(access.message).catch(() => null);
    return null;
  }
  if (access.kind === 'unknown') {
    await botSessions.clear(telegramId);
    onUnknown?.();
    await ctx.reply(notLinkedMessage).catch(() => null);
    return null;
  }
  return access.user;
}
