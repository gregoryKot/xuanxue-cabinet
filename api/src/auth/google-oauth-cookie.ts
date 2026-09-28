// Cookie `google_oauth` — переносит state/verifier/nonce/join через переход
// на Google и обратно (ADR-0145). Без cookie-parser, тем же приёмом, что
// session-cookie.ts: формат простой, внешняя зависимость не оправдана.
// Path=/api/auth/google — cookie видна только двум эндпоинтам самого потока
// (start/POST), не всему API. Max-Age=600 (10 минут) — с запасом на то, чтобы
// человек успел выбрать аккаунт Google, но короче TTL заявки email-входа.
import { GOOGLE_LINK_INTENT } from '@xuanxue/shared';
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
   * знает); повторная проверка валидности — уже в GoogleLoginIdentityService.
   * Не пишется вместе с `intent`/`userId` ниже — привязка код не спрашивает. */
  join?: string;
  /** `GOOGLE_LINK_INTENT` — вкладка ведёт не ко входу, а к привязке Google
   * уже вошедшего человека («Профиль», ADR-0145): `start?intent=link`
   * положил сюда id сессии, `POST /auth/google` сверяет его с сессией самого
   * запроса, а не берёт userId из тела — тело клиент не подписывает. */
  intent?: typeof GOOGLE_LINK_INTENT;
  userId?: string;
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
  const { state, verifier, nonce, join, intent, userId } = parsed as Record<
    string,
    unknown
  >;
  if (typeof state !== 'string' || typeof verifier !== 'string') return null;
  if (typeof nonce !== 'string') return null;
  if (join !== undefined && typeof join !== 'string') return null;
  if (intent !== undefined && intent !== GOOGLE_LINK_INTENT) return null;
  if (userId !== undefined && (typeof userId !== 'string' || userId === '')) return null;
  // Привязка обязана нести id сессии — без него POST не с кем сверить.
  if (intent === GOOGLE_LINK_INTENT && userId === undefined) return null;
  return { state, verifier, nonce, join, intent, userId };
}
