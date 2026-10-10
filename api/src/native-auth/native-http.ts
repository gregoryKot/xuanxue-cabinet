// Что нативные маршруты требуют от самого HTTP-запроса (профиль Workshop
// 3c98d4a, «Transport», «Account read and renewal», revoke): точный вид
// bearer-заголовка, отсутствие query и тела у `me`, ровно `{}` у `renew`,
// только форма у `revoke`, строгий разбор форм. Правила собраны в одном файле,
// чтобы расходиться с профилем было негде. Тесты — native-account.e2e-spec.ts
// и native-http.spec.ts.
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mediaType, routePath, type IncomingRequestLike } from '../common/raw-body-route';
import { isBodyParserError } from '../common/body-parser-error.mapper';
import { NativeAuthError } from './native-auth-error';
import { sendNativeError, type NativeResponseLike } from './native-response';

const NATIVE_ROUTE_PREFIX = '/api/auth/native';
/** Маршруты с телом-формой. Код обмена (`token`) добавится вместе с самим маршрутом. */
const NATIVE_FORM_PATHS: ReadonlySet<string> = new Set([`${NATIVE_ROUTE_PREFIX}/revoke`]);
/** Тело формы — два-три поля по 43 знака; больше — не наш клиент. */
const NATIVE_FORM_LIMIT = '4kb';
const FORM_MEDIA_TYPE = 'application/x-www-form-urlencoded';
const JSON_MEDIA_TYPE = 'application/json';
const BEARER_HEADER_RE = /^Bearer (\S+)$/i;
const CHARSET_RE = /;\s*charset\s*=\s*"?([^";\s]+)/i;

/** Запрос в том виде, в каком его читают правила ниже (Express 5). */
export interface NativeRequestLike {
  headers: Record<string, string | string[] | undefined>;
  rawHeaders: string[];
  query?: Record<string, unknown>;
  body?: unknown;
}

function isUtf8(contentType: string | string[] | undefined): boolean {
  const charset =
    typeof contentType === 'string' ? CHARSET_RE.exec(contentType)?.[1] : '';
  return !charset || charset.toLowerCase() === 'utf-8';
}

function hasMediaType(req: NativeRequestLike, expected: string): boolean {
  const header = req.headers['content-type'];
  return mediaType(header) === expected && isUtf8(header);
}

// Тело есть, если заявлена длина или потоковая передача — так же решает body-parser.
function hasRequestBody(req: NativeRequestLike): boolean {
  const length = req.headers['content-length'];
  return (
    req.headers['transfer-encoding'] !== undefined ||
    (length !== undefined && length !== '0')
  );
}

/** `Authorization: Bearer <токен>` ровно в одном заголовке. Другая схема,
 * повтор заголовка и его отсутствие — одинаково `invalid_token`: cookie сессии
 * браузера bearer не заменяет и ответ не меняет. Node при повторе отбрасывает
 * все заголовки `authorization`, кроме первого, поэтому считаем по rawHeaders. */
export function bearerTokenOf(req: NativeRequestLike): string {
  const count = req.rawHeaders.filter(
    (name, index) => index % 2 === 0 && name.toLowerCase() === 'authorization',
  ).length;
  const header = req.headers.authorization;
  const token =
    count === 1 && typeof header === 'string'
      ? BEARER_HEADER_RE.exec(header)?.[1]
      : undefined;
  if (!token) throw new NativeAuthError('invalid_token');
  return token;
}

/** `GET me`: без параметров и без тела. */
export function assertNoRequestInput(req: NativeRequestLike): void {
  if (Object.keys(req.query ?? {}).length > 0 || hasRequestBody(req)) {
    throw new NativeAuthError('invalid_request');
  }
}

/** `POST renew`: UTF-8 JSON и тело ровно `{}`. Отсутствующее тело, массив, не
 * объект и любое поле — `invalid_request`. */
export function assertEmptyJsonObject(req: NativeRequestLike): void {
  const body = req.body;
  const isEmptyObject =
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0;
  if (!hasMediaType(req, JSON_MEDIA_TYPE) || !hasRequestBody(req) || !isEmptyObject) {
    throw new NativeAuthError('invalid_request');
  }
}

/** `POST revoke`: только форма. JSON с теми же полями парсер тела тоже
 * разберёт, поэтому тип проверяем отдельно. */
export function assertFormRequest(req: NativeRequestLike): void {
  if (!hasMediaType(req, FORM_MEDIA_TYPE)) throw new NativeAuthError('invalid_request');
}

/** Предикат парсера форм: только POST на маршруты формы, только заявленная форма. */
export function isNativeFormRequest(req: IncomingRequestLike): boolean {
  return (
    (req.method ?? '').toUpperCase() === 'POST' &&
    NATIVE_FORM_PATHS.has(routePath(req.url)) &&
    mediaType(req.headers['content-type']) === FORM_MEDIA_TYPE
  );
}

function isNativePath(url: string | undefined): boolean {
  return routePath(url).startsWith(`${NATIVE_ROUTE_PREFIX}/`);
}

/** Ошибки парсеров тела случаются до маршрутизации и до маршрутного фильтра:
 * без этого битый JSON в `renew` получил бы конверт ApiErrorBody вместо
 * `{"error":"invalid_request"}`. На чужих путях ошибка идёт дальше как была. */
export function nativeBodyErrorHandler(
  err: unknown,
  req: { url?: string },
  res: NativeResponseLike,
  next: (err?: unknown) => void,
): void {
  if (err instanceof Error && isBodyParserError(err) && isNativePath(req.url)) {
    sendNativeError(res, 'invalid_request');
    return;
  }
  next(err);
}

/** Строгий разбор форм: `extended: false` оставляет ключ `a[b]` как есть (лишнее
 * поле для ValidationPipe), а повтор имени даёт массив, который не проходит `@IsString`. */
export function configureNativeBodyParsing(app: NestExpressApplication): void {
  app.useBodyParser('urlencoded', {
    extended: false,
    type: isNativeFormRequest,
    limit: NATIVE_FORM_LIMIT,
  });
  app.use(nativeBodyErrorHandler);
}
