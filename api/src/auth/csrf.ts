// CSRF-защита мутирующих запросов (SECURITY §2, ADR-0012). Правило —
// заголовок обязателен для ЛЮБОГО мутирующего запроса, включая @Public(),
// кроме помеченных @SkipCsrf() (вебхук Telegram): одна ветка вместо
// «публичный — не проверяем», меньше мест, где легко забыть исключение.
import { CSRF_HEADER } from '@xuanxue/shared';

/** Node склеивает дублирующиеся заголовки одной строкой через запятую (кроме
 * set-cookie, который сюда не попадает) — значение здесь никогда не массив. */
export function hasCsrfHeader(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const value = headers[CSRF_HEADER];
  return typeof value === 'string' && value.length > 0;
}
