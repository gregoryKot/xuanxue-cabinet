// Куда вести ученика с кнопкой «Отправить скриншот» (ADR-0050): бот первым,
// кабинет запасным. Deep link `pay_<YYYY-MM>` открывает чат бота с уже
// названным месяцем; без связанного Telegram (или без имени бота в
// настройках сервера) остаётся загрузка файла прямо в кабинете.
import {
  PAYMENT_TELEGRAM_START_PREFIX,
  type AuthConfigDto,
  type MeDto,
} from '@xuanxue/shared';

export type PaymentScreenshotRoute = { kind: 'bot'; href: string } | { kind: 'upload' };

export function paymentScreenshotRoute(
  me: Pick<MeDto, 'telegramLinked'>,
  telegramBotUsername: AuthConfigDto['telegramBotUsername'],
  month: string,
): PaymentScreenshotRoute {
  if (!me.telegramLinked || !telegramBotUsername) return { kind: 'upload' };
  return {
    kind: 'bot',
    href: `https://t.me/${telegramBotUsername}?start=${PAYMENT_TELEGRAM_START_PREFIX}${month}`,
  };
}
