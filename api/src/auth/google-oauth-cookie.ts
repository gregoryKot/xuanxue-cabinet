// Cookie `google_oauth` — переносит state/verifier/nonce/join через переход
// на Google и обратно (ADR-0145). Сборка, гашение и чтение JSON — общие с
// Telegram (oauth-state-cookie.ts); здесь только имя, Path и поля Google.
// Path=/api/auth/google — cookie видна только двум эндпоинтам самого потока
// (start/POST), не всему API.
import { GOOGLE_LINK_INTENT } from '@xuanxue/shared';
import {
  buildOAuthCookie,
  clearOAuthCookie,
  readOAuthCookie,
  type OAuthCookieSpec,
} from './oauth-state-cookie';

export const GOOGLE_OAUTH_COOKIE = 'google_oauth';
const GOOGLE_COOKIE: OAuthCookieSpec = {
  name: GOOGLE_OAUTH_COOKIE,
  path: '/api/auth/google',
};

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
  options: { secure: boolean },
): string {
  return buildOAuthCookie(GOOGLE_COOKIE, payload, options);
}

/** Ставится ПЕРЕД любым кодом, который может бросить (GoogleAuthController):
 * заявка одноразовая (oauth-state-cookie.ts). */
export function clearGoogleOAuthCookie(): string {
  return clearOAuthCookie(GOOGLE_COOKIE);
}

/** `null` — cookie нет, битый base64url/JSON или не хватает обязательного
 * поля: всё это один и тот же случай для вызывающего кода — GOOGLE_LOGIN_FAILED_MESSAGE. */
export function readGoogleOAuthCookie(
  cookieHeader: string | undefined,
): GoogleOAuthCookiePayload | null {
  const parsed = readOAuthCookie(GOOGLE_COOKIE, cookieHeader);
  if (!parsed) return null;
  const { state, verifier, nonce, join, intent, userId } = parsed;
  if (typeof state !== 'string' || typeof verifier !== 'string') return null;
  if (typeof nonce !== 'string') return null;
  if (join !== undefined && typeof join !== 'string') return null;
  if (intent !== undefined && intent !== GOOGLE_LINK_INTENT) return null;
  if (userId !== undefined && (typeof userId !== 'string' || userId === '')) return null;
  // Привязка обязана нести id сессии — без него POST не с кем сверить.
  if (intent === GOOGLE_LINK_INTENT && userId === undefined) return null;
  return { state, verifier, nonce, join, intent, userId };
}
