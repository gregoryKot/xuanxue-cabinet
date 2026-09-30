// Контракт оплат (docs/PLAN.md §15, ADR-0049) — месяц в поясе школы, три
// статуса, деньги целым числом агорот. Чистый модуль: без Luxon (CLAUDE.md
// «Слои» — shared не знает ни о Nest, ни о React) — перевод DateTime → месяц
// живёт в api/src/payments/payment-month.ts, здесь только строка и её формат.
import type { PaymentScreenshotKind } from './payment-screenshot';

export const PAYMENT_STATUSES = ['unpaid', 'awaiting', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Валюта одна — шекель (ADR-0049), и живёт она в одном месте: символ ₪
// внутри `formatAmountIls` ниже. Отдельной константы с кодом 'ILS' нет —
// читать её оказалось некому, а экспорт без потребителя роняет knip
// (CLAUDE.md «Дубли и мёртвый код»). Появится вторая валюта — появится и
// поле, но это будет другое решение и другой ADR.

/** Префикс payload `/start` бота для скриншота оплаты (ADR-0050, слой
 * 2.2) — `t.me/<бот>?start=pay_<YYYY-MM>`, тем же приёмом, что
 * `INVITE_TELEGRAM_START_PREFIX`/`TELEGRAM_LINK_START_PREFIX`
 * (invite-link.ts/telegram-link.ts). Месяц после префикса сверяется тем же
 * `MONTH_KEY_RE` (month-key.ts), что и DTO оплат — второго regexp'а формата месяца в
 * проекте нет. */
export const PAYMENT_TELEGRAM_START_PREFIX = 'pay_';

export const PAYMENT_LIMITS = {
  /** 100 000 ₪ в агорах — щедрый потолок формы, не тариф школы. */
  amountMinorMax: 10_000_000,
  note: 500,
  listLimitDefault: 50,
  listLimitMax: 200,
} as const;

/** 25000 → '250 ₪', 25050 → '250,50 ₪' — запятая, русский разделитель дробной
 * части (ADR-0049: деньги — целое число агорот, дробная арифметика в шекелях
 * в код не попадает, только этот форматтер режет агоры на экран). */
export function formatAmountIls(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) return '';
  const shekels = Math.floor(amountMinor / 100);
  const agorot = amountMinor % 100;
  if (agorot === 0) return `${shekels} ₪`;
  return `${shekels},${String(agorot).padStart(2, '0')} ₪`;
}

/** Строка `GET /payments` — один активный ученик школы, даже без документа
 * (ADR-0049: «не оплачен» — такой же ответ, как «оплачен», Маша должна
 * видеть молчащих). Байты и `file_id` скриншота в список не идут никогда —
 * только `screenshotKind`; байты кабинета — `GET /payments/:userId/:month/
 * screenshot` (ADR-0149). */
export interface PaymentDto {
  userId: string;
  userName: string;
  month: string;
  status: PaymentStatus;
  amountMinor?: number;
  confirmedAt?: string; // ISO UTC с Z
  /** Где снимок, а не только «есть ли»: `upload` — байты в кабинете, открываются
   * по нажатию; `telegram` — у бухгалтера в чате с ботом (ADR-0149). */
  screenshotKind?: PaymentScreenshotKind;
  reminderSentAt?: string; // ISO UTC с Z
}

/** Строка `GET /me/payments` — без `userId`/`userName`, это и так «мои». */
export interface MyPaymentDto {
  month: string;
  status: PaymentStatus;
  amountMinor?: number;
  confirmedAt?: string; // ISO UTC с Z
  hasScreenshot: boolean;
}

/** Ответ `GET /me/payments` (слой 2.4) — пара, как у `PaymentsPageDto`:
 * `month` — текущий месяц в поясе школы, его считает сервер (`monthKeyOf`
 * по `settings.tz`). Кабинет пояса школы не знает, а месяц по часам зрителя
 * 1-го числа в Сиднее уже октябрь, пока в Израиле сентябрь (ADR-0049).
 * `rows` — только месяцы, о которых что-то известно: нет документа — нет
 * строки, и кабинет рисует текущий месяц «не оплачен» сам. */
export interface MyPaymentsPageDto {
  month: string;
  rows: MyPaymentDto[];
  /** Кому присылать скриншот перевода — `settings.paymentContact` (ADR-0159).
   * Ученику вне роли штата `GET /settings` недоступен, поэтому контакт едет в
   * его же ответе, а не отдельным запросом. */
  contact: string;
  /** День напоминания об оплате, как его видит ученик (ADR-0160). Поля нет,
   * пока школа напоминание не включила: выбор дня, который ничего не делает,
   * ученику не показываем (ADR-0069). */
  reminder?: MyPaymentReminderDto;
}

/** Когда ученику придёт напоминание об оплате (ADR-0160). `dayOfMonth` — день,
 * который сработает: свой (`isOwnDay`) или школы. Ответ `PUT
 * /me/payments/reminder-day` — тот же тип, кабинет вписывает его без второго
 * GET (ADR-0087). */
export interface MyPaymentReminderDto {
  dayOfMonth: number;
  isOwnDay: boolean;
  schoolDayOfMonth: number;
  /** 'HH:mm' в поясе школы — час один для всех, выбирается только день. */
  time: string;
}

/** Тело `PUT /me/payments/reminder-day`: 1–31 — свой день, `null` — «как у
 * школы» (личный выбор сбрасывается). */
export interface SetPaymentReminderDayInput {
  dayOfMonth: number | null;
}

/** Сколько дней живёт снимок перевода (ADR-0050): после подтверждения и без
 * него. Одно место на уборщика (payment-screenshot-sweep.service.ts) и на
 * текст кабинета рядом с кнопкой «Отправить скриншот» — поменяли срок, и
 * обещание ученику поменялось вместе с ним. */
export const PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS = 30;
export const PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS = 90;

export interface PaymentsPageDto {
  month: string;
  rows: PaymentDto[];
}

export interface ListPaymentsQuery {
  month?: string;
  status?: PaymentStatus;
  limit?: number;
}

/** Тело `POST /payments/:userId/:month/confirm` — оба поля необязательны
 * (ADR-0049: отметить оплату можно без суммы — главный случай — перевод,
 * который бухгалтер видит в выписке, вводить число ради галочки не нужно). */
export interface ConfirmPaymentInput {
  amountMinor?: number;
  note?: string;
}

/** `PUT /me/payments/reminder-day` при выключенном школой напоминании (409,
 * ADR-0160): выбирать нечего, пока оно не включено. */
export const PAYMENT_REMINDER_DISABLED_MESSAGE =
  'Напоминания об оплате сейчас выключены школой.';

export const PAYMENT_MONTH_INVALID_MESSAGE =
  'Месяц должен быть в формате ГГГГ-ММ, например 2026-09.';

export const PAYMENT_STUDENT_NOT_FOUND_MESSAGE =
  'Ученик не найден среди активных учеников школы. Обновите список.';

export const PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE =
  'Абонемент есть только у учеников — у сотрудника школы его нет.';

export const PAYMENT_NOTHING_TO_REVOKE_MESSAGE =
  'Снимать нечего — подтверждения за этот месяц ещё нет.';
