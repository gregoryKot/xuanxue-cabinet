// Окно допустимых месяцев для скриншота оплаты (ADR-0050, docs/PLAN.md §15
// слой 2.2) — без него подделанная ссылка `pay_2099-12` завела бы документ,
// который повиснет в списке у бухгалтера навсегда. Чистая функция, юнит-тест
// без Mongo (CLAUDE.md «Тесты»): месяц сравнивается со строками той же формы
// `YYYY-MM` (MONTH_KEY_RE) — они упорядочены лексикографически так же, как
// хронологически, отдельная арифметика с датами не нужна.
import type { DateTime } from 'luxon';
import { shiftMonth } from '@xuanxue/shared';
import { monthKeyOf } from '../../payments/payment-month';

// Абонементы задним числом бухгалтер отмечает и без скриншота (ADR-0049) —
// 11 месяцев назад достаточно, чтобы принять недавний долг; 1 месяц вперёд —
// про раннюю оплату следующего месяца.
const PAYMENT_SCREENSHOT_MONTHS_BACK = 11;
const PAYMENT_SCREENSHOT_MONTHS_FORWARD = 1;

export function isPaymentMonthInWindow(
  month: string,
  now: DateTime,
  tz: string,
): boolean {
  const current = monthKeyOf(now, tz);
  const earliest = shiftMonth(current, -PAYMENT_SCREENSHOT_MONTHS_BACK);
  const latest = shiftMonth(current, PAYMENT_SCREENSHOT_MONTHS_FORWARD);
  return month >= earliest && month <= latest;
}
