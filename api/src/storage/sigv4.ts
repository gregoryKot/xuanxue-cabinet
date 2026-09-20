// Две формы подписи AWS Signature Version 4, которые нужны файлам материалов
// (ADR-0057): подписанная ссылка на скачивание (подпись в query, ученик
// скачивает мимо нашего инстанса) и запрос с заголовком Authorization
// (загрузка и удаление объекта из нашего кода). Общая часть — sigv4-canonical.ts.
//
// Без `@aws-sdk/*`: SDK тянет мегабайты зависимостей в образ ради нескольких
// десятков строк — тот же выбор, что у сессии (ADR-0012) и почты (ADR-0029).
import type { DateTime } from 'luxon';
import {
  SIGV4_ALGORITHM,
  canonicalQuery,
  credentialScope,
  sha256Hex,
  sigV4Dates,
  signCanonicalRequest,
  type SigV4Credentials,
} from './sigv4-canonical';

// Подписанной ссылке тело не сопутствует, и S3-совместимые хранилища ждут
// здесь именно это слово, а не хеш пустой строки.
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const HOST_HEADER = 'host';
const AMZ_DATE_HEADER = 'x-amz-date';
const AMZ_CONTENT_SHA256_HEADER = 'x-amz-content-sha256';
const SIGNATURE_PARAM = 'X-Amz-Signature';

export interface PresignInput {
  /** Полный адрес объекта без query. */
  url: string;
  /** Параметры, которые хранилище применит к ответу (`response-content-type`,
   * `response-content-disposition`). Они входят в подпись — подменить имя
   * скачиваемого файла в готовой ссылке нельзя. */
  params?: Record<string, string>;
  expiresInSeconds: number;
  /** Явный `now` (Luxon), не `DateTime.utc()` внутри — детерминизм теста
   * (CLAUDE.md «Тесты»). */
  now: DateTime;
  credentials: SigV4Credentials;
}

/** Ссылка на скачивание со сроком жизни в минуты: право проверено до её
 * выдачи, поэтому ссылка и живёт недолго (ADR-0057). */
export function presignGetUrl({
  url,
  params = {},
  expiresInSeconds,
  now,
  credentials,
}: PresignInput): string {
  const target = new URL(url);
  const { amzDate, scopeDate } = sigV4Dates(now);
  const scope = credentialScope(credentials, scopeDate);
  const query = canonicalQuery({
    ...params,
    'X-Amz-Algorithm': SIGV4_ALGORITHM,
    'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': HOST_HEADER,
  });
  const { signature } = signCanonicalRequest({
    method: 'GET',
    url: target,
    query,
    headers: { [HOST_HEADER]: target.host },
    payloadHash: UNSIGNED_PAYLOAD,
    now,
    credentials,
  });
  return `${target.origin}${target.pathname}?${query}&${SIGNATURE_PARAM}=${signature}`;
}

/** Заголовки, которые надо поставить на запрос. `authorization` объявлен
 * явно: под `noUncheckedIndexedAccess` чтение ключа из `Record<string, string>`
 * даёт `string | undefined`, а этот заголовок есть всегда. */
export type SignedRequestHeaders = Record<string, string> & { authorization: string };

export interface SignedRequestInput {
  method: 'PUT' | 'DELETE';
  url: string;
  /** Заголовки запроса без `host`, `x-amz-date` и `x-amz-content-sha256` —
   * их подставляет и подписывает сама функция. */
  headers: Record<string, string>;
  body: Buffer;
  now: DateTime;
  credentials: SigV4Credentials;
}

/** Заголовки для запроса с телом (загрузка) или без него (удаление). Хеш
 * тела подписывается явно, а не через UNSIGNED-PAYLOAD: при загрузке есть
 * что защищать от подмены по дороге. */
export function signRequestHeaders({
  method,
  url,
  headers,
  body,
  now,
  credentials,
}: SignedRequestInput): SignedRequestHeaders {
  const target = new URL(url);
  const { amzDate } = sigV4Dates(now);
  const payloadHash = sha256Hex(body);
  const signed: Record<string, string> = {
    ...headers,
    [AMZ_DATE_HEADER]: amzDate,
    [AMZ_CONTENT_SHA256_HEADER]: payloadHash,
  };
  const { scope, signedHeaders, signature } = signCanonicalRequest({
    method,
    url: target,
    query: '',
    headers: { ...signed, [HOST_HEADER]: target.host },
    payloadHash,
    now,
    credentials,
  });
  return {
    ...signed,
    authorization:
      `${SIGV4_ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
