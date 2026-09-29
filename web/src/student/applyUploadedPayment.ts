// Вписывает ответ POST /me/payments/:month/screenshot в уже загруженную
// страницу абонемента: строка того же месяца заменяется, нового месяца нет —
// добавляется первой (свежие сверху, как у сервера). Так экран показывает
// результат записи из её же ответа, без второго GET (ADR-0087).
import type { MyPaymentDto, MyPaymentsPageDto } from '@xuanxue/shared';

export function applyUploadedPayment(
  page: MyPaymentsPageDto | null,
  dto: MyPaymentDto,
): MyPaymentsPageDto | null {
  // Страницы ещё нет — ответ класть некуда: кнопка появляется только вместе
  // со страницей, так что это гонка с перечитыванием, а не обычный путь.
  if (!page) return page;
  const exists = page.rows.some((row) => row.month === dto.month);
  return {
    ...page,
    rows: exists
      ? page.rows.map((row) => (row.month === dto.month ? dto : row))
      : [dto, ...page.rows],
  };
}
