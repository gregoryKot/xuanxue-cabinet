// Разбор и проверка id_token, который Google вернул из token endpoint
// (ADR-0145) — БЕЗ проверки подписи. Причина: этот токен получен НАШИМ
// сервером напрямую от Google по TLS в обмен на client_secret и
// code_verifier PKCE (GoogleTokenClient) — тот же канал доверия, что у
// любого другого ответа token endpoint. OpenID Connect Core 1.0 §3.1.3.7
// «ID Token Validation», пункт 6, прямо разрешает для Authorization Code
// Flow полагаться на проверку TLS-сервера вместо проверки подписи JWT —
// в отличие от Implicit/Hybrid Flow, где токен приходит через браузер и
// подпись обязательна. Проверять подпись здесь значило бы держать JWKS
// Google и синхронизировать его ротацию — лишняя поверхность без пользы.
//
// Чистая функция без DI — юнит-тест без Nest и без сети (CLAUDE.md «Тесты»).
import type { DateTime } from 'luxon';
import type { GoogleIdentity } from '../users/google-login-identity.service';
import { timingSafeEqualStrings } from './google-oauth-pkce';

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SUB_MAX_LENGTH = 255;
const AUTHORITATIVE_DOMAINS = ['gmail.com', 'googlemail.com'];

export interface ParseGoogleIdTokenParams {
  clientId: string;
  /** `nonce` из cookie `google_oauth` (не из запроса) — сверяется постоянным
   * временем, тот же приём, что `state` (GoogleAuthService). */
  nonce: string;
  now: DateTime;
}

/** Бросает `Error` с причиной в сообщении (не показывается пользователю —
 * GoogleAuthService ловит и отвечает одним GOOGLE_LOGIN_FAILED_MESSAGE на
 * любую из веток, SECURITY §2). */
export function parseGoogleIdToken(
  idToken: string,
  { clientId, nonce, now }: ParseGoogleIdTokenParams,
): GoogleIdentity {
  const claims = decodePayload(idToken);

  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.has(claims.iss)) {
    throw new Error('id_token: неизвестный iss');
  }
  if (!audienceMatches(claims, clientId)) {
    throw new Error('id_token: aud не совпадает с client_id');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= now.toSeconds()) {
    throw new Error('id_token: истёк');
  }
  if (typeof claims.nonce !== 'string' || !timingSafeEqualStrings(claims.nonce, nonce)) {
    throw new Error('id_token: nonce не совпадает');
  }
  if (
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    claims.sub.length > SUB_MAX_LENGTH
  ) {
    throw new Error('id_token: sub отсутствует или слишком длинный');
  }

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : undefined;
  const emailVerified = claims.email_verified === true;

  return {
    sub: claims.sub,
    email,
    emailVerified,
    emailAuthoritative: isAuthoritative(email, emailVerified, claims.hd),
    givenName: typeof claims.given_name === 'string' ? claims.given_name : undefined,
    familyName: typeof claims.family_name === 'string' ? claims.family_name : undefined,
    name: typeof claims.name === 'string' ? claims.name : undefined,
  };
}

/** `aud` — обычно строка; массив допускает спецификация OIDC, тогда `azp`
 * (authorized party) обязан называть именно нашего клиента. */
function audienceMatches(claims: Record<string, unknown>, clientId: string): boolean {
  if (typeof claims.aud === 'string') return claims.aud === clientId;
  if (Array.isArray(claims.aud)) {
    return claims.aud.includes(clientId) && claims.azp === clientId;
  }
  return false;
}

/** Google ручается за владельца адреса только в двух случаях (документация
 * Google Identity, «email_verified»): личный аккаунт Gmail/Googlemail, или
 * Google Workspace-аккаунт домена `hd`, если сам адрес оканчивается на этот
 * домен. Во всех остальных случаях `email_verified: true` значит лишь «этот
 * адрес был подтверждён почтой когда-то при регистрации в Google» — владелец
 * с тех пор мог смениться, связывать аккаунты по такому адресу нельзя. */
function isAuthoritative(
  email: string | undefined,
  emailVerified: boolean,
  hd: unknown,
): boolean {
  if (!email || !emailVerified) return false;
  if (AUTHORITATIVE_DOMAINS.some((domain) => email.endsWith(`@${domain}`))) return true;
  return typeof hd === 'string' && email.endsWith(`@${hd.toLowerCase()}`);
}

function decodePayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('id_token: не похож на JWT');
  const payloadPart = parts[1];
  if (!payloadPart) throw new Error('id_token: пустой payload');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new Error('id_token: payload не JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('id_token: payload не объект');
  }
  return parsed as Record<string, unknown>;
}
