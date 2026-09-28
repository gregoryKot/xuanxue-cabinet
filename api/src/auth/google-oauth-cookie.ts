// Cookie `google_oauth` — переносит state/verifier/nonce/join через переход
// на Google и обратно (ADR-0145). Без cookie-parser, тем же приёмом, что
// session-cookie.ts: формат простой, внешняя зависимость не оправдана.
// Path=/api/auth/google — cookie видна только двум эндпоинтам самого потока
// (start/POST), не всему API. Max-Age=600 (10 минут) — с запасом на то, чтобы
// человек успел выбрать аккаунт Google, но короче TTL заявки email-входа.
import { readCookie } from './session-cookie';

export const GOOGLE_OAUTH_COOKIE = 'google_oauth';
const COOKIE_PATH = 'Path=/api/auth/google';
const MAX_AGE_SEC = 600;

export interface GoogleOAuthCookiePayload {
  state: string;
  verifier: string;
  nonce: string;
  /** Код ссылки-приглашения, если он был в query `?join=` у `start` и прошёл
   * формат (проверяется в google-auth.service.ts — cookie сама формат не
   * знает); повторная проверка валидности — уже в GoogleLoginIdentityService. */
  join?: string;
}

export function buildGoogleOAuthCookie(
  payload: GoogleOAuthCookiePayload,
  { secure }: { secure: boolean },
): string {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const attrs = [
    `${GOOGLE_OAUTH_COOKIE}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    COOKIE_PATH,
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Max-Age=0 гасит cookie независимо от Secure — тот же приём, что
 * clearSessionCookie() (session-cookie.ts). Ставится ПЕРЕД любым кодом,
 * который может бросить (GoogleAuthController): заявка одноразовая, второй
 * попытке нечего в ней искать, даже если первая упала на середине. */
export function clearGoogleOAuthCookie(): string {
  const attrs = [
    `${GOOGLE_OAUTH_COOKIE}=`,
    'HttpOnly',
    'SameSite=Lax',
    COOKIE_PATH,
    'Max-Age=0',
  ];
  return attrs.join('; ');
}

/** `null` — cookie нет, битый base64url/JSON или не хватает обязательного
 * поля: всё это один и тот же случай для вызывающего кода — GOOGLE_LOGIN_FAILED_MESSAGE. */
export function readGoogleOAuthCookie(
  cookieHeader: string | undefined,
): GoogleOAuthCookiePayload | null {
  const raw = readCookie(cookieHeader, GOOGLE_OAUTH_COOKIE);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { state, verifier, nonce, join } = parsed as Record<string, unknown>;
  if (typeof state !== 'string' || typeof verifier !== 'string') return null;
  if (typeof nonce !== 'string') return null;
  if (join !== undefined && typeof join !== 'string') return null;
  return { state, verifier, nonce, join };
}
