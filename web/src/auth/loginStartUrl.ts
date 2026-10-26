// Адрес старта входа через внешнего провайдера (Google, Telegram по OpenID
// Connect, ADR-0145/ADR-0187). Браузер переходит на него целой вкладкой, не
// `apiFetch`: сервер отвечает httpOnly-cookie и 302 к провайдеру. Код
// ссылки-приглашения едет query-параметром `join` (`INVITE_QUERY_PARAM`,
// ADR-0030) — сервер кладёт его в cookie состояния и вернёт вместе со страницей
// возврата. Один сборщик на двоих: у Google и Telegram он был бы тем же кодом
// слово в слово (CLAUDE.md «Одна механика — один компонент»).
import { INVITE_QUERY_PARAM } from '@xuanxue/shared';

/** Чистая функция, без обращения к `window` — свой тест (loginStartUrl.test.ts).
 * `startPath` — `GOOGLE_LOGIN_START_PATH` или `TELEGRAM_OIDC_START_PATH`. */
export function loginStartUrl(startPath: string, inviteCode?: string): string {
  const query = inviteCode
    ? `?${INVITE_QUERY_PARAM}=${encodeURIComponent(inviteCode)}`
    : '';
  return `${startPath}${query}`;
}
