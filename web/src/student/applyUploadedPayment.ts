// Вписывает ответ POST /me/payments/:month/screenshot в уже загруженную
// страницу абонемента: строка того же месяца заменяется, нового месяца нет —
// добавляется первой (свежие сверху, как у сервера). Так экран показывает
// результат записи из её же ответа, без второго GET (ADR-0087).
import type { MyPaymentDto, MyPaymentsPageDto } from '@xuanxue/shared';

export function applyUploadedPayment(
  page: MyPaymentsPageDto,
  dto: MyPaymentDto,
): MyPaymentsPageDto {
  const exists = page.rows.some((row) => row.month === dto.month);
  return {
    ...page,
    rows: exists
      ? page.rows.map((row) => (row.month === dto.month ? dto : row))
      : [dto, ...page.rows],
  };
}
