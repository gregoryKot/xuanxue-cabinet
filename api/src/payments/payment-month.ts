// Месяц оплаты — в поясе школы, не в UTC и не в поясе того, кто нажал кнопку
// (ADR-0049): 1 сентября 00:30 по Israel в UTC ещё август, и оплата попала бы
// не в тот месяц. Только Luxon, явный пояс (CLAUDE.md «Время») — `new Date`
// и арифметика на миллисекундах здесь неприменимы в принципе.
import type { DateTime } from 'luxon';
import { isMonthKey, PAYMENT_MONTH_INVALID_MESSAGE } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

export function monthKeyOf(now: DateTime, tz: string): string {
  return now.setZone(tz).toFormat('yyyy-LL');
}

/** `month` из пути (`/payments/:userId/:month/...`, `/me/payments/:month/
 * screenshot`) не проходит через DTO — class-validator валидирует тело и
 * query, не сегменты пути. Тот же формат проверяем здесь, до похода в базу,
 * одинаково на всех путях оплат. */
export function assertMonthKey(month: string): void {
  if (!isMonthKey(month)) throw new InvalidInputError(PAYMENT_MONTH_INVALID_MESSAGE);
}
