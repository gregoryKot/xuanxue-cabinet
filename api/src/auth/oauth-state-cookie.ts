// Общая часть cookie заявки OAuth — `google_oauth` (ADR-0145) и
// `telegram_oauth` (ADR-0187): переносит state/verifier (и nonce, join) через
// переход на провайдера и обратно. Сборка, гашение и чтение JSON живут здесь
// один раз; какие поля обязательны и что они значат — знает файл провайдера
// (google-oauth-cookie.ts, telegram-oidc-cookie.ts). Без cookie-parser, тем же
// приёмом, что session-cookie.ts: формат простой, зависимость не оправдана.
//
// Path сужен до эндпоинтов самого потока (start/POST), не всего API.
// Max-Age=600 (10 минут) — с запасом на то, чтобы человек успел выбрать
// аккаунт у провайдера, но короче TTL заявки email-входа.
import { readCookie } from './session-cookie';

export interface OAuthCookieSpec {
  name: string;
  /** Значение атрибута `Path` (без `Path=`). */
  path: string;
}

const MAX_AGE_SEC = 600;

export function buildOAuthCookie(
  spec: OAuthCookieSpec,
  payload: object,
  { secure }: { secure: boolean },
): string {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const attrs = [
    `${spec.name}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${spec.path}`,
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Max-Age=0 гасит cookie независимо от Secure — тот же приём, что
 * browserLogoutCookies() (session-cookie.ts). Контроллер ставит её ПЕРЕД любым
 * кодом, который может бросить: заявка одноразовая, второй попытке нечего в
 * ней искать, даже если первая упала на середине (SECURITY §2). */
export function clearOAuthCookie(spec: OAuthCookieSpec): string {
  return [
    `${spec.name}=`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${spec.path}`,
    'Max-Age=0',
  ].join('; ');
}

/** `null` — cookie нет, битый base64url/JSON или не объект: для вызывающего
 * кода всё это один и тот же случай («войдите заново»). Наличие и тип полей
 * проверяет файл провайдера. */
export function readOAuthCookie(
  spec: OAuthCookieSpec,
  cookieHeader: string | undefined,
): Record<string, unknown> | null {
  const raw = readCookie(cookieHeader, spec.name);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}
