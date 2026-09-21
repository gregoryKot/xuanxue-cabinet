// Подпись VAPID (RFC 8292) на встроенном crypto — ES256 JWT на каждый push-
// запрос, без сторонних библиотек (ADR-0092 отвергает web-push). Тот же
// приём, что у HMAC-JWT сессии (api/src/auth/session-token.ts, ADR-0012):
// токен собирается вручную, а не через jsonwebtoken/jose.
//
// Главная ловушка — push из-за неё просто не приходит, без единой ошибки в
// собственном коде: `crypto.sign` для EC-ключа по умолчанию отдаёт подпись в
// DER, а JWS ES256 (и, значит, VAPID) требует raw `r||s` ровно 64 байта.
// С DER push-сервис отвечает 401 — обычным отказом авторизации, который
// легко принять за неверный ключ, а не неверный формат подписи. Единственное
// лекарство — `dsaEncoding: 'ieee-p1363'` и на подпись здесь, и на проверку
// в тесте (vapid-jwt.spec.ts): это и есть тот самый тест, который ловит DER
// там, где просто «JWT собрался» — не ловит.
import { createPrivateKey, sign as signEcdsa } from 'crypto';
import type { DateTime } from 'luxon';
import type { VapidConfig } from './vapid.config';

// RFC 8292: `exp` не дальше 24 часов от текущего момента. 12 — с запасом, а
// не «на грани»: тик, который чуть опоздал, не должен получить токен,
// который уже невалиден по времени у push-сервиса.
const VAPID_JWT_TTL_HOURS = 12;

const JWT_HEADER = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));

function base64url(input: string | Buffer): string {
  return Buffer.isBuffer(input)
    ? input.toString('base64url')
    : Buffer.from(input, 'utf8').toString('base64url');
}

/**
 * JWK из `VapidConfig` — та же трансформация в обратную сторону, что делает
 * `scripts/generate-vapid-keys.mjs`: `x`/`y` — байты 1..33 и 33..65
 * несжатой точки `VAPID_PUBLIC_KEY` (`0x04 || X || Y`, 65 байт), `d` —
 * `VAPID_PRIVATE_KEY` как есть (уже 32 байта base64url, RFC 7518 §6.2.1).
 */
function privateKeyFrom(config: VapidConfig) {
  const point = Buffer.from(config.publicKey, 'base64url');
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
      d: config.privateKey,
    },
    format: 'jwk',
  });
}

export interface VapidRequestAuth {
  /** JWT целиком — нужен только тесту (разобрать и проверить подпись). */
  jwt: string;
  /** Готовое значение заголовка `Authorization` (RFC 8292 §3). */
  authorizationHeader: string;
}

/**
 * Подпись на один push-запрос. `endpoint` — адрес конкретной подписки:
 * `aud` обязан быть его origin, не URL целиком (RFC 8292) — путь и query
 * push-сервис при проверке не сверяет, а лишний кусок в `aud` заставит его
 * отказать. `now` — параметр, не `Date.now()` (CLAUDE.md «Детерминизм»):
 * `exp` обязан быть проверяемым в тесте.
 */
export function signVapidRequest(
  config: VapidConfig,
  endpoint: string,
  now: DateTime,
): VapidRequestAuth {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(now.plus({ hours: VAPID_JWT_TTL_HOURS }).toSeconds());
  const payload = base64url(JSON.stringify({ aud, exp, sub: config.subject }));
  const data = `${JWT_HEADER}.${payload}`;

  const signature = signEcdsa('sha256', Buffer.from(data, 'utf8'), {
    key: privateKeyFrom(config),
    // Ловушка из шапки файла: без этой опции Node отдаёт DER.
    dsaEncoding: 'ieee-p1363',
  });

  const jwt = `${data}.${base64url(signature)}`;
  return { jwt, authorizationHeader: `vapid t=${jwt}, k=${config.publicKey}` };
}
