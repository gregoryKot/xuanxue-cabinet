// Строки абонемента для экрана ученика (PLAN §15 слой 2.4) — чистый
// форматтер без DOM и сети: тестируется отдельно, компонент только рисует.
// Ученику показываем ровно три состояния и ничего сверх них (ADR-0049):
// оплачено, ждём подтверждения, оплаты нет. Ни один экран занятий эти
// строки не читает — неоплата ничего не закрывает.
import {
  formatMonthNameRu,
  formatMonthRu,
  type MyPaymentDto,
  type MyPaymentsPageDto,
  type PaymentStatus,
} from '@xuanxue/shared';
import { formatDayMonth } from '../lib/formatDate';

const PAID_TEXT = 'Оплачено';
const AWAITING_TEXT = 'Ждём подтверждения';

export interface MonthLine {
  month: string;
  /** «Сентябрь 2026» — с прописной, это заголовок строки. */
  title: string;
  status: PaymentStatus;
  text: string;
  /** Скриншот можно прислать, пока месяц не подтверждён. */
  canSendScreenshot: boolean;
}

export interface MyPaymentLines {
  current: MonthLine;
  others: MonthLine[];
}

/** Дата подтверждения — в поясе зрителя (по часам его устройства), не школы:
 * ученик сверяет её со своим календарём (ADR-0060). */
export function paymentStatusText(month: string, row: MyPaymentDto | undefined): string {
  if (row?.status === 'paid') {
    return row.confirmedAt
      ? `${PAID_TEXT} ${formatDayMonth(row.confirmedAt)}`
      : PAID_TEXT;
  }
  if (row?.status === 'awaiting') return AWAITING_TEXT;
  return `Оплаты за ${formatMonthNameRu(month)} нет`;
}

function toMonthLine(month: string, row: MyPaymentDto | undefined): MonthLine {
  const title = formatMonthRu(month);
  const status = row?.status ?? 'unpaid';
  return {
    month,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    status,
    text: paymentStatusText(month, row),
    canSendScreenshot: status !== 'paid',
  };
}

/** `current` — месяц с сервера (`page.month`, в поясе школы), а не по часам
 * зрителя: 1-го числа в Сиднее уже октябрь, пока в Израиле сентябрь, и
 * скриншот за «октябрь» сервер бы принял не туда. Строки остальных месяцев
 * идут в порядке сервера (свежие сверху). */
export function myPaymentLines(page: MyPaymentsPageDto): MyPaymentLines {
  const currentRow = page.rows.find((row) => row.month === page.month);
  return {
    current: toMonthLine(page.month, currentRow),
    others: page.rows
      .filter((row) => row.month !== page.month)
      .map((row) => toMonthLine(row.month, row)),
  };
}
