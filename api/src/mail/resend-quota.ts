// Разбор тела ошибки Resend ради одного поля `name` — вынесено из
// mail.service.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»). Квота плана
// (100 писем в сутки на бесплатном) исчерпана — ученику нужен не «через
// минуту», а совет войти через Telegram (аудит 2026-10-01, F48).

// Имена ошибок Resend, означающие исчерпанную квоту. 429 с
// `rate_limit_exceeded` сюда не входит — там «через минуту» честно.
const RESEND_QUOTA_ERROR_NAMES: ReadonlySet<string> = new Set([
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
]);

/** Имя ошибки квоты из тела ответа Resend (`{ statusCode, name, message }`)
 * или undefined: тело не JSON, без name или не про квоту. Остального тела не
 * читает — там может быть адрес получателя, в лог ему нельзя. */
export async function resendQuotaErrorName(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { name?: unknown };
    return typeof body.name === 'string' && RESEND_QUOTA_ERROR_NAMES.has(body.name)
      ? body.name
      : undefined;
  } catch {
    return undefined;
  }
}
