// Числовой id бота — префикс BOT_TOKEN до двоеточия (формат гарантирует
// BOT_TOKEN_RE в env.rules.ts: `\d+:...`). Нужен `GET /auth/config`, чтобы
// фронт мог собрать адрес перехода на Telegram
// (`redirectToTelegramAuth(botId)`, web/src/auth/telegramAuthRedirect.ts,
// ADR-0028) — чистая функция, тестируется без ConfigService/HTTP.
export function botIdFromToken(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const [idPart] = token.split(':');
  const id = Number(idPart);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
