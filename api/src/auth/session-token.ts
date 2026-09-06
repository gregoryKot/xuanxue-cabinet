// HS256 JWT вручную на встроенном crypto — ADR-0012 (без jsonwebtoken/jose).
// Алгоритм зафиксирован: подпись всегда HMAC-SHA256, `alg` из заголовка
// токена не читается и не влияет на проверку — подделка с `alg: none` не
// может дать верную подпись без секрета, потому что мы её не сверяем с тем,
// что заявлено в заголовке, а всегда пересчитываем сами.
import { createHmac, timingSafeEqual } from 'crypto';
import type { DateTime } from 'luxon';

/** Токен DI-провайдера секрета сессии — гвард (через AuthService) и
 * AuthService берут секрет только отсюда, фабрика — в auth.module.ts:
 * JWT_SECRET из ConfigService, если задан, иначе временный секрет процесса
 * (валидатор env.validation.ts гарантирует JWT_SECRET в production). */
export const SESSION_SECRET = 'SESSION_SECRET';

/** «90 дней с последнего использования» (SECURITY §2) — абсолютного потолка
 * нет: каждая выдача (вход, rolling-перевыпуск) отодвигает `exp` на этот срок
 * заново. */
export const SESSION_MAX_AGE_DAYS = 90;
export const SESSION_MAX_AGE_SEC = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

const HEADER = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

/** Полезная нагрузка — epoch-секунды, не Date/DateTime: сериализуется в JSON
 * как есть, сравнение с `now` — тоже в секундах (CLAUDE.md «Время»: время
 * параметром, единый тип на входе и выходе одной функции). */
export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signSession(
  { userId, issuedAt }: { userId: string; issuedAt: DateTime },
  secret: string,
): string {
  const iat = Math.floor(issuedAt.toSeconds());
  const payload: SessionPayload = { sub: userId, iat, exp: iat + SESSION_MAX_AGE_SEC };
  const data = `${HEADER}.${base64url(JSON.stringify(payload))}`;
  return `${data}.${sign(data, secret)}`;
}

/** Полезная нагрузка после `JSON.parse` — `unknown`, а не `SessionPayload`:
 * `JSON.parse` разбирает любой валидный JSON (`null`, число, массив), и без
 * этой проверки поле вроде `payload.sub` читалось бы с `undefined`/`TypeError`
 * дальше по коду (shouldRenew, гвард), а не отказом входа. `Number.isFinite`
 * отсекает и нечисловые значения, и переполнение вроде `1e400` → `Infinity`,
 * которое иначе давало бы вечный токен (`now >= exp` никогда не наступает). */
function isSessionPayloadShape(value: unknown): value is SessionPayload {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    Number.isFinite(candidate.iat) &&
    Number.isFinite(candidate.exp)
  );
}

/** null на любую проблему (структура, подпись, срок) — гвард не различает
 * причину отказа для пользователя (SECURITY §2: «нет/битая/протухшая → 401»). */
export function verifySession(
  token: string,
  secret: string,
  now: DateTime,
): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  // noUncheckedIndexedAccess не связывает проверку длины выше с типом
  // элементов — но раз parts.length === 3, все три индекса определены.
  const header = parts[0] ?? '';
  const payloadPart = parts[1] ?? '';
  const signature = parts[2] ?? '';
  const data = `${header}.${payloadPart}`;

  // Длины сравниваем до timingSafeEqual — сам timingSafeEqual бросает
  // исключение на буферах разной длины, а не возвращает false.
  const actual = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(sign(data, secret), 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isSessionPayloadShape(parsed)) return null;

  if (Math.floor(now.toSeconds()) >= parsed.exp) return null;
  return parsed;
}
