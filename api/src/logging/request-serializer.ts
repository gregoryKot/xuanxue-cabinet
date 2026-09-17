// Сериализатор req для pino-http (CLAUDE.md «Логи и наблюдаемость», SECURITY
// §2): pino-std-serializers кладёт в лог req.url целиком, вместе с query-
// строкой — код ссылки-приглашения (?join=, ADR-0030) и токен входа по email
// (?token=, ссылка письма /login/email) иначе уходят в «request completed»
// открытым текстом на каждый запрос. req.query.*, тело и заголовки редактирует
// REDACT_PATHS (redact-paths.ts) — url собирается отдельной строкой и туда не
// попадает, поэтому редакция здесь.
import type { IncomingMessage } from 'http';
import pino from 'pino';
import { INVITE_QUERY_PARAM } from '@xuanxue/shared';

// Токен входа по email сейчас всегда приходит в теле (POST /auth/email/verify,
// req.body.inviteCode/hash — см. redact-paths.ts), не query. Параметр описан
// на случай, если его когда-нибудь передадут GET'ом (ссылка письма уже несёт
// ?token=, просто читает её фронт, не API) — редактировать задним числом,
// когда утечка уже в логах Railway, поздно.
const LOGIN_TOKEN_QUERY_PARAM = 'token';

// Тот же текст, что censor в buildPinoHttpOptions (redact.censor) — единый
// маркер «здесь был секрет» для обоих механизмов редакции.
export const REDACTED_VALUE = '[Redacted]';

const SENSITIVE_QUERY_PARAMS: readonly string[] = [
  INVITE_QUERY_PARAM,
  LOGIN_TOKEN_QUERY_PARAM,
];

// Чистая функция — вырезает значения перечисленных query-параметров из url,
// не трогая путь, их порядок и остальные параметры. Отдельно от сериализатора,
// чтобы проверять без pino и без IncomingMessage (правило CLAUDE.md: логика —
// с тестом).
export function redactQueryValues(url: string, params: readonly string[]): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) {
    return url;
  }
  const path = url.slice(0, queryStart);
  const query = url
    .slice(queryStart + 1)
    .split('&')
    .map((pair) => redactPair(pair, params))
    .join('&');
  return `${path}?${query}`;
}

function redactPair(pair: string, params: readonly string[]): string {
  const separatorIndex = pair.indexOf('=');
  const name = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
  return params.includes(name) ? `${name}=${REDACTED_VALUE}` : pair;
}

// Обёртка над стандартным сериализатором pino (`pino.stdSerializers.req`):
// сперва он раскладывает IncomingMessage в req.{method,url,headers,query,...}
// как обычно, потом мы редактируем только url. logging.module.ts выключает
// pino-http'шный wrapSerializers — иначе pino-http обернул бы этот
// сериализатор ещё одним проходом стандартного и прогнал бы через него уже
// сериализованный объект: тот без req.socket, и remoteAddress/remotePort
// молча превратились бы в undefined.
export function redactRequestSerializer(raw: IncomingMessage): pino.SerializedRequest {
  const serialized = pino.stdSerializers.req(raw);
  serialized.url = redactQueryValues(serialized.url, SENSITIVE_QUERY_PARAMS);
  return serialized;
}
