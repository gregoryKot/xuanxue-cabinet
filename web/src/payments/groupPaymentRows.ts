import type { PaymentDto, PaymentStatus } from '@xuanxue/shared';

export interface PaymentGroup {
  status: PaymentStatus;
  title: string;
  rows: PaymentDto[];
}

// Порядок групп — порядок работы бухгалтера: сначала то, что ждёт
// решения, потом закрытое, в конце молчащие. Заголовок — общий текст экрана
// (VOICE.md: заголовки с прописной только первое слово).
const GROUP_ORDER: ReadonlyArray<{ status: PaymentStatus; title: string }> = [
  { status: 'awaiting', title: 'Ждут подтверждения' },
  { status: 'paid', title: 'Оплатили' },
  { status: 'unpaid', title: 'Без оплаты' },
];

/** Строки по группам статуса; пустая группа не возвращается, внутри группы
 * остаётся порядок сервера (по имени ученика). */
export function groupPaymentRows(rows: PaymentDto[]): PaymentGroup[] {
  return GROUP_ORDER.map(({ status, title }) => ({
    status,
    title,
    rows: rows.filter((row) => row.status === status),
  })).filter((group) => group.rows.length > 0);
}
