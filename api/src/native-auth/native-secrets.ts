// Секреты нативного входа (ADR-0181): bearer и, в следующем PR, код обмена —
// 32 байта из CSPRNG в base64url без выравнивания, ровно 43 знака. В базе
// лежит только sha256: утечка чтения базы не даёт рабочих bearer (профиль
// Workshop 3c98d4a, «Accepted native credential protection»).
import { createHash, randomBytes } from 'crypto';

const NATIVE_SECRET_BYTES = 32;
const NATIVE_SECRET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function newNativeSecret(): string {
  return randomBytes(NATIVE_SECRET_BYTES).toString('base64url');
}

/** Формат проверяется до обращения к базе: чужой токен (cookie сессии, мусор)
 * не должен стоить запроса и не должен давать иной ответ, чем неизвестный. */
export function isNativeSecretFormat(value: string): boolean {
  return NATIVE_SECRET_FORMAT.test(value);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** PKCE S256 (RFC 7636 §4.2): sha256 от ASCII-verifier, base64url без `=`. */
export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
