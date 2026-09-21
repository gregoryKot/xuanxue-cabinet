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
//
// Разбор пути и заявленного типа — common/raw-body-route.ts: та же механика
// понадобилась файлам материалов (ADR-0057), и второй копии разбора не
// осталось (CLAUDE.md «Дубли и мёртвый код»).
//
// Последняя проверка — подписанная сессия (SECURITY §4, ADR-0081, мера 1),
// та же, что и у material-file-body.ts: дешёвая HMAC-проверка ставится
// последней, после метода/пути/типа.
import { DateTime } from 'luxon';
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamImageContentType } from '@xuanxue/shared';
import { hasSignedSession } from '../common/raw-body-session';
import { mediaType, routePath, type IncomingRequestLike } from '../common/raw-body-route';

export const EXAM_IMAGES_ROUTE_PATH = '/api/exam-images';

/** Оба маршрута сырого тела картинок (SECURITY §4). `:month` здесь — любой
 * сегмент без слеша: формат месяца проверяет сам контроллер тем же
 * `MONTH_KEY_RE`, что и остальные пути оплат (PaymentsService,
 * `assertMonthKey`), а парсеру достаточно узнать маршрут — чужой месяц всё
 * равно упрётся во владение по сессии, а кривой получит 400 из общего
 * конверта. Файл материала (ADR-0057) в этом списке не значится: у него свой
 * потолок втрое больше и свой предикат, material-file-body.ts. */
const RAW_IMAGE_UPLOAD_ROUTES: readonly RegExp[] = [
  // Картинка варианта ответа — только штат школы (ADR-0035).
  new RegExp(`^${EXAM_IMAGES_ROUTE_PATH}$`),
  // Снимок перевода — тот, чей Telegram с кабинетом не связан (ADR-0050).
  /^\/api\/me\/payments\/[^/]+\/screenshot$/,
];

/** Валидатор media type — тот же приём, что isNotificationKind
 * (shared/src/notifications.ts): один guard, не includes на каждого
 * потребителя. */
function isExamImageContentType(value: string): value is ExamImageContentType {
  return (EXAM_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Фабрика вместо голой функции — та же причина, что у
 * `makeIsMaterialFileUpload` (material-file-body.ts): секрет сессии из DI
 * замыкается один раз в app.setup.ts, предикат зовётся на каждый запрос. */
export function makeIsRawImageUpload(
  secret: string,
): (req: IncomingRequestLike) => boolean {
  return (req: IncomingRequestLike): boolean => {
    if ((req.method ?? '').toUpperCase() !== 'POST') return false;
    const path = routePath(req.url);
    if (!RAW_IMAGE_UPLOAD_ROUTES.some((route) => route.test(path))) return false;
    if (!isExamImageContentType(mediaType(req.headers['content-type']))) return false;
    return hasSignedSession(req, secret, DateTime.utc());
  };
}
