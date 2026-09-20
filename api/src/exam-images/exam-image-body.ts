// Предикат для сырого парсера тела (app.setup.ts, useBodyParser('raw', {
// type: isRawImageUpload })) — сырое тело включается по функции маршрута и
// типа, а не по image/* глобально: иначе картинка в ЛЮБОМ запросе (в том
// числе на несуществующий или чужой маршрут) превращалась бы в Buffer, и
// ValidationPipe (whitelist/forbidNonWhitelisted) перебирал бы его как
// «лишние поля» — с телом почти в мегабайт это заметная работа на каждый
// чужой запрос, а не только на настоящую загрузку картинки (ADR-0035).
//
// Маршрутов стало два (ADR-0050), и список их — здесь, в одном месте
// (SECURITY §4): привязка к одному литеральному пути второго маршрута не
// пережила бы — снимок перевода адресуется месяцем.
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamImageContentType } from '@xuanxue/shared';

export const EXAM_IMAGES_ROUTE_PATH = '/api/exam-images';

/** Оба маршрута сырого тела (SECURITY §4). `:month` здесь — любой сегмент
 * без слеша: формат месяца проверяет сам контроллер тем же `MONTH_KEY_RE`,
 * что и остальные пути оплат (PaymentsService, `assertMonthKey`), а парсеру
 * достаточно узнать маршрут — чужой месяц всё равно упрётся во владение по
 * сессии, а кривой получит 400 из общего конверта. */
const RAW_IMAGE_UPLOAD_ROUTES: readonly RegExp[] = [
  // Картинка варианта ответа — только штат школы (ADR-0035).
  new RegExp(`^${EXAM_IMAGES_ROUTE_PATH}$`),
  // Снимок перевода — тот, чей Telegram с кабинетом не связан (ADR-0050).
  /^\/api\/me\/payments\/[^/]+\/screenshot$/,
];

/** Минимальный интерфейс вместо `IncomingMessage` из `'http'` напрямую — тот
 * же приём, что `RequestLike` в common/http-headers.ts. `IncomingMessage`
 * структурно совместим с ним (url?/method?/headers['content-type'] — те же
 * типы), поэтому `isRawImageUpload` подходит под `type?: (req:
 * IncomingMessage) => any` из NestExpressBodyParserOptions без приведения. */
export interface IncomingRequestLike {
  url?: string;
  method?: string;
  headers: { 'content-type'?: string | string[] | undefined };
}

function routePath(url: string | undefined): string {
  const path = (url ?? '').split('?')[0] ?? '';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function mediaType(header: string | string[] | undefined): string {
  if (typeof header !== 'string') return '';
  return (header.split(';')[0] ?? '').trim().toLowerCase();
}

/** Валидатор media type — тот же приём, что isNotificationKind
 * (shared/src/notifications.ts): один guard, не includes на каждого
 * потребителя. */
function isExamImageContentType(value: string): value is ExamImageContentType {
  return (EXAM_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isRawImageUpload(req: IncomingRequestLike): boolean {
  if ((req.method ?? '').toUpperCase() !== 'POST') return false;
  const path = routePath(req.url);
  if (!RAW_IMAGE_UPLOAD_ROUTES.some((route) => route.test(path))) return false;
  return isExamImageContentType(mediaType(req.headers['content-type']));
}
