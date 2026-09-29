// Текст напоминания об оплате — чистая сборка без Mongo и без DI (CLAUDE.md
// «Тесты»). Шаблон и его allow-list — из shared (ADR-0051): пустая подстановка
// исчезает вместе со своим необязательным фрагментом `[ … ]`, поэтому
// сообщение без ссылки не кончается висячим пробелом.
import {
  formatAmountIls,
  formatMonthRu,
  PAYMENT_REMINDER_PLACEHOLDERS,
  PAYMENT_TELEGRAM_START_PREFIX,
  renderTemplate,
} from '@xuanxue/shared';
import { telegramStartUrl } from '../telegram/telegram-start-url';

export interface PaymentReminderTextInput {
  template: string;
  name: string;
  /** 'YYYY-MM' в поясе школы. */
  month: string;
  amountMinor?: number;
  /** `undefined` — бот ещё не прогрет и имя неизвестно: ссылки не будет. */
  botUsername?: string;
  /** Кому присылать скриншот — `settings.paymentContact` (ADR-0159). */
  contact: string;
}

export function buildPaymentReminderText(input: PaymentReminderTextInput): string {
  return renderTemplate(
    input.template,
    {
      имя: input.name,
      месяц: formatMonthRu(input.month),
      сумма: input.amountMinor === undefined ? '' : formatAmountIls(input.amountMinor),
      // Deep link сам открывает бота в режиме «пришлите скриншот» (ADR-0050,
      // handlePaymentScreenshotDeepLink); ожидание в `bot_sessions` при
      // отправке не заводится (ADR-0150).
      ссылка: input.botUsername
        ? telegramStartUrl(
            input.botUsername,
            `${PAYMENT_TELEGRAM_START_PREFIX}${input.month}`,
          )
        : '',
      контакт: input.contact,
    },
    PAYMENT_REMINDER_PLACEHOLDERS,
  );
}
