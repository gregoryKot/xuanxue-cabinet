import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';

/** Страница с заменённой строкой — ответ `confirm`/`revoke` кладётся в список
 * на месте, без второго `GET` (ADR-0087). Место строки не меняется: сервер
 * отдаёт список по имени ученика, а запись имя не трогает, так что правка
 * даёт то же, что вернул бы свежий запрос.
 *
 * Месяц строки не совпал с месяцем страницы — человек за время запроса
 * переключился на другой месяц: ответ про чужой месяц на экран не идёт. */
export function withPaymentRow(
  page: PaymentsPageDto | null,
  row: PaymentDto,
): PaymentsPageDto | null {
  if (page === null || page.month !== row.month) return page;
  return {
    ...page,
    rows: page.rows.map((current) => (current.userId === row.userId ? row : current)),
  };
}
