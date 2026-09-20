// Канонический запрос и подпись AWS Signature Version 4 — общая часть для
// подписанной ссылки и для запроса с заголовком Authorization (sigv4.ts).
// Своя реализация вместо `@aws-sdk/*` — решение ADR-0057; здесь же, отдельным
// файлом, чтобы обе формы подписи не повторяли один и тот же вывод ключа и
// сборку канонического запроса (CLAUDE.md «Дубли и мёртвый код»).
//
// Чистые функции без DI и без сети: спека sigv4.spec.ts сверяет их с
// опубликованным примером AWS.
import { createHash, createHmac } from 'crypto';
import type { DateTime } from 'luxon';

export const SIGV4_ALGORITHM = 'AWS4-HMAC-SHA256';
const REQUEST_TYPE = 'aws4_request';
const AMZ_DATE_FORMAT = "yyyyLLdd'T'HHmmss'Z'";
const SCOPE_DATE_FORMAT = 'yyyyLLdd';

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** У R2 всегда `auto` (r2.config.ts) — параметром, а не константой, чтобы
   * подпись проверялась примером из документации AWS с регионом `us-east-1`. */
  region: string;
  service: string;
}

/** Процентное кодирование по RFC 3986: `encodeURIComponent` оставляет
 * `!'()*` как есть, а канонический запрос требует и их. */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function sha256Hex(payload: Buffer | string): string {
  return createHash('sha256').update(payload).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** Две формы даты, которых требует подпись: метка запроса и день области
 * действия ключа. Только Luxon и только UTC (CLAUDE.md «Время»). */
export function sigV4Dates(now: DateTime): { amzDate: string; scopeDate: string } {
  const utc = now.toUTC();
  return {
    amzDate: utc.toFormat(AMZ_DATE_FORMAT),
    scopeDate: utc.toFormat(SCOPE_DATE_FORMAT),
  };
}

/** Область действия ключа — `20130524/auto/s3/aws4_request`. Нужна и самой
 * подписи, и параметру `X-Amz-Credential` подписанной ссылки, который
 * собирается до вызова `signCanonicalRequest` (sigv4.ts). */
export function credentialScope(
  credentials: SigV4Credentials,
  scopeDate: string,
): string {
  return `${scopeDate}/${credentials.region}/${credentials.service}/${REQUEST_TYPE}`;
}

/** Ключ подписи выводится из секрета по дате, региону и сервису — сам секрет
 * в запрос не попадает даже в производном виде дольше суток. */
function signingKey(credentials: SigV4Credentials, scopeDate: string): Buffer {
  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, scopeDate);
  const kRegion = hmac(kDate, credentials.region);
  const kService = hmac(kRegion, credentials.service);
  return hmac(kService, REQUEST_TYPE);
}

/** Параметры query в канонической форме: сортировка по имени, обе половины
 * пары закодированы по RFC 3986. */
export function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(params[name] ?? '')}`)
    .join('&');
}

export interface SignInput {
  method: string;
  /** Адрес объекта. Канонический путь берётся из него как есть: ключи мы
   * собираем сами из безопасных символов (object-key.ts), а повторное
   * кодирование уже закодированного пути дало бы подпись под другим адресом. */
  url: URL;
  /** Уже канонический query (`canonicalQuery`) или пустая строка. */
  query: string;
  /** Все подписываемые заголовки, включая `host`. */
  headers: Record<string, string>;
  /** Хеш тела или `UNSIGNED-PAYLOAD` для подписанной ссылки. */
  payloadHash: string;
  now: DateTime;
  credentials: SigV4Credentials;
}

export interface SignResult {
  amzDate: string;
  /** `20130524/auto/s3/aws4_request` — попадает в `X-Amz-Credential`. */
  scope: string;
  /** Имена подписанных заголовков через `;`. */
  signedHeaders: string;
  signature: string;
}

export function signCanonicalRequest({
  method,
  url,
  query,
  headers,
  payloadHash,
  now,
  credentials,
}: SignInput): SignResult {
  const { amzDate, scopeDate } = sigV4Dates(now);
  const scope = credentialScope(credentials, scopeDate);
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const byName = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()]),
  );
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    url.pathname,
    query,
    names.map((name) => `${name}:${byName.get(name) ?? ''}\n`).join(''),
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    SIGV4_ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  return {
    amzDate,
    scope,
    signedHeaders,
    signature: hmac(signingKey(credentials, scopeDate), stringToSign).toString('hex'),
  };
}
