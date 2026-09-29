// Криптографические примитивы PKCE (RFC 7636) для входа через Google
// (ADR-0145) — чистые функции над node:crypto, без зависимости от Nest, чтобы
// проверялись юнит-тестом без DI (CLAUDE.md «Тесты»).
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** `randomBytes(n)` в base64url без выравнивания — формат `state`
 * (GOOGLE_OAUTH_STATE_RE, shared/src/google-login.ts) и `code_verifier`/
 * `nonce` совпадает по построению: тот же приём, что у sessionToken. */
export function randomUrlSafe(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** `code_challenge` для `code_challenge_method=S256` (RFC 7636 §4.2):
 * BASE64URL-ENCODE(SHA256(ASCII(code_verifier))). */
export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Сравнение `state`/`nonce` постоянным временем — то же требование, что у
 * подписи Telegram и токена сессии (SECURITY §2): обычное `===` выдаёт
 * секрет по времени сравнения при переборе посимвольно. Разная длина строк
 * — заведомо «не совпадает», без утечки через исключение timingSafeEqual. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
