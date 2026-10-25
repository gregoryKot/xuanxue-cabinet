import { formatAmountIls, type PaymentDto } from '@xuanxue/shared';
import { formatDayMonth } from '../lib/formatDate';

const AWAITING_TEXT = 'Прислали снимок перевода';
const UNPAID_TEXT = 'Оплаты пока нет';
const PAID_TEXT = 'Оплачено';

/** Строка статуса под именем ученика. Дата подтверждения — по часам зрителя
 * (ADR-0060), `timeZone` нужен только тестам. Сумма необязательна: главный
 * случай — отметка без числа (ADR-0049). */
export function paymentStatusText(row: PaymentDto, timeZone?: string): string {
  if (row.status === 'awaiting') return AWAITING_TEXT;
  if (row.status === 'unpaid') return UNPAID_TEXT;

  const date = row.confirmedAt ? formatDayMonth(row.confirmedAt, timeZone) : null;
  const amount = row.amountMinor === undefined ? '' : formatAmountIls(row.amountMinor);
  const parts = [date ? `${PAID_TEXT} ${date}` : PAID_TEXT, amount].filter(Boolean);
  return parts.join(' · ');
}
