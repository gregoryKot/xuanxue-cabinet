// Что показывает карточка «Оплата» на доске (ADR-0173): заголовок с месяцем,
// строка статуса и — только пока оплаты нет — кому прислать снимок перевода.
// Чистая функция без DOM: строки месяца считает myPaymentLines.ts (один
// источник текста для «Профиля» и доски), здесь только выбор, что из них
// ученику нужно на первом экране. «Ждём подтверждения» и «Оплачено» ничего от
// ученика не просят, контакт им не нужен (ADR-0049: три состояния).
import {
  formatMonthRu,
  type MyPaymentsPageDto,
  type PaymentStatus,
} from '@xuanxue/shared';
import { myPaymentLines } from '../student/myPaymentLines';

export interface BoardPaymentView {
  /** «Оплата за октябрь 2026» — месяц в винительном падеже совпадает с именительным. */
  heading: string;
  status: PaymentStatus;
  statusText: string;
  /** Контакт бухгалтера; `null`, когда присылать ничего не нужно. */
  contact: string | null;
}

export function boardPaymentView(page: MyPaymentsPageDto): BoardPaymentView {
  const { current } = myPaymentLines(page);
  return {
    heading: `Оплата за ${formatMonthRu(current.month)}`,
    status: current.status,
    statusText: current.text,
    contact: current.status === 'unpaid' ? page.contact : null,
  };
}
