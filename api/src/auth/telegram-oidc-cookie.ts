// Cookie `telegram_oauth` — переносит state/verifier/join через переход на
// oauth.telegram.org и обратно (ADR-0187). Сборка, гашение и чтение JSON —
// общие с Google (oauth-state-cookie.ts); здесь имя, Path и поля Telegram.
// Path=/api/auth/telegram/oidc — cookie видна только двум эндпоинтам самого
// потока (start/POST), не всему API и не легаси-входу `/api/auth/telegram`.
// Nonce нет: в запросе к Telegram его не шлют (telegram-oidc-url.ts).
import {
  buildOAuthCookie,
  clearOAuthCookie,
  readOAuthCookie,
  type OAuthCookieSpec,
} from './oauth-state-cookie';

export const TELEGRAM_OAUTH_COOKIE = 'telegram_oauth';
const TELEGRAM_COOKIE: OAuthCookieSpec = {
  name: TELEGRAM_OAUTH_COOKIE,
  path: '/api/auth/telegram/oidc',
};

export interface TelegramOAuthCookiePayload {
  state: string;
  verifier: string;
  /** Код ссылки-приглашения, если он был в query `?join=` у `start` и прошёл
   * формат (проверяется в telegram-oidc.service.ts — cookie формат не знает);
   * действительность кода проверяет уже LoginIdentityService. */
  join?: string;
}

export function buildTelegramOAuthCookie(
  payload: TelegramOAuthCookiePayload,
  options: { secure: boolean },
): string {
  return buildOAuthCookie(TELEGRAM_COOKIE, payload, options);
}

/** Ставится ПЕРЕД любым кодом, который может бросить (TelegramOidcController):
 * заявка одноразовая (oauth-state-cookie.ts). */
export function clearTelegramOAuthCookie(): string {
  return clearOAuthCookie(TELEGRAM_COOKIE);
}

/** `null` — cookie нет, битый base64url/JSON или не хватает обязательного поля:
 * для вызывающего кода всё это TELEGRAM_LOGIN_FAILED_MESSAGE. */
export function readTelegramOAuthCookie(
  cookieHeader: string | undefined,
): TelegramOAuthCookiePayload | null {
  const parsed = readOAuthCookie(TELEGRAM_COOKIE, cookieHeader);
  if (!parsed) return null;
  const { state, verifier, join } = parsed;
  if (typeof state !== 'string' || typeof verifier !== 'string') return null;
  if (join !== undefined && typeof join !== 'string') return null;
  return { state, verifier, join };
}
