// pay_<YYYY-MM> — deep link «Отправить скриншот» из кабинета (ADR-0050,
// docs/PLAN.md §15 слой 2.2), вынесено из StartHandler целиком (файл-лимит,
// тот же приём, что exam-media-deep-link.ts). Разбор — start-payload.ts.
// `denied` (blocked) — готовый отказ бота, ожидание не заводим (SECURITY §9).
// `unknown` (Telegram не связан с кабинетом, ADR-0029/0034) — отказ СРАЗУ, до
// того как человек потратил время на скриншот (RUNBOOK §8.17, тот же приём,
// что у видео экзамена). `active` — окно допустимых месяцев
// (payments/payment-month-window.ts — общее с приёмом снимка в кабинете):
// подделанная ссылка на месяц вне окна
// не заводит ожидание, честный отказ с названием месяца — иначе документ за
// `2099-12` повис бы в списке у бухгалтера навсегда. В окне — заводим
// ожидание и называем месяц по-русски (formatMonthRu): человек должен видеть,
// за какой месяц у него сейчас примут скриншот.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { formatMonthRu } from '@xuanxue/shared';
import type { SettingsService } from '../../settings/settings.service';
import type { BotSessionService } from '../bot-session.service';
import type { BotUserAccessService } from '../bot-user-access.service';
import { isPaymentMonthInWindow } from '../../payments/payment-month-window';

export const PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE =
  'Этот Telegram не связан с вашим кабинетом, поэтому скриншот сюда не примем. ' +
  'Свяжите Telegram в кабинете, на экране «Профиль», и возвращайтесь по этой же кнопке.';

function monthOutOfWindowMessage(month: string): string {
  return (
    `Ссылка на ${formatMonthRu(month)} уже не действует. ` +
    'Откройте «Отправить скриншот» в кабинете ещё раз.'
  );
}

function waitMessage(month: string): string {
  return `Пришлите скриншот перевода за ${formatMonthRu(month)} — обычным фото в этот чат.`;
}

export interface PaymentScreenshotDeepLinkDeps {
  botSessions: BotSessionService;
  botAccess: BotUserAccessService;
  settingsService: SettingsService;
}

export async function handlePaymentScreenshotDeepLink(
  ctx: Context,
  telegramId: number,
  month: string,
  now: DateTime,
  deps: PaymentScreenshotDeepLinkDeps,
): Promise<void> {
  const access = await deps.botAccess.resolve(telegramId);
  if (access.kind === 'denied') {
    await ctx.reply(access.message).catch(() => null);
    return;
  }
  if (access.kind === 'unknown') {
    await ctx.reply(PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE).catch(() => null);
    return;
  }

  const { tz } = await deps.settingsService.get();
  if (!isPaymentMonthInWindow(month, now, tz)) {
    await ctx.reply(monthOutOfWindowMessage(month)).catch(() => null);
    return;
  }

  await deps.botSessions.startPaymentWait(telegramId, month, now);
  await ctx.reply(waitMessage(month)).catch(() => null);
}
