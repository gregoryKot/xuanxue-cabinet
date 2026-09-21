// Предикат для сырого парсера тела (app.setup.ts) — второй и последний
// потребитель этой механики после картинок вариантов (exam-image-body.ts,
// ADR-0035). Сырое тело включается по маршруту и заявленному типу, а не по
// `application/pdf` глобально: иначе такое тело в ЛЮБОМ запросе (в том числе
// на чужой маршрут) превращалось бы в Buffer, и ValidationPipe
// (whitelist/forbidNonWhitelisted) перебирал бы его как «лишние поля» — на
// тридцати мегабайтах это заметная работа на каждый чужой запрос.
//
// Заявленному типу мы всё равно не верим: формат решает сигнатура байтов
// (material-file-upload.ts). Здесь он только включает парсер.
//
// Последняя проверка — подписанная сессия (SECURITY §4, ADR-0081, мера 1):
// предиката без неё было достаточно, чтобы буферизовать 30 МБ в память ДО
// AuthGuard. hasSignedSession дешёвой HMAC-проверкой ставится последней —
// метод/путь/тип отсекают мусор дешевле, чем HMAC.
import { DateTime } from 'luxon';
import { MATERIAL_FILE_CONTENT_TYPES } from '@xuanxue/shared';
import { hasSignedSession } from '../common/raw-body-session';
import { mediaType, routePath, type IncomingRequestLike } from '../common/raw-body-route';

/** `/api/materials/<24 hex>/file` — id проверяется формой ObjectId прямо
 * здесь: иначе предикат включал бы сырой парсер на любой мусор в пути. */
const UPLOAD_PATH_RE = /^\/api\/materials\/[0-9a-fA-F]{24}\/file$/;

/** Фабрика вместо голой функции: секрет сессии достаётся из DI один раз в
 * app.setup.ts (`app.get(SESSION_SECRET)`) и замыкается на предикат — сам
 * предикат зовётся на каждый запрос и в БД не ходит. */
export function makeIsMaterialFileUpload(
  secret: string,
): (req: IncomingRequestLike) => boolean {
  return (req: IncomingRequestLike): boolean => {
    if ((req.method ?? '').toUpperCase() !== 'POST') return false;
    if (!UPLOAD_PATH_RE.test(routePath(req.url))) return false;
    const type = mediaType(req.headers['content-type']);
    if (!(MATERIAL_FILE_CONTENT_TYPES as readonly string[]).includes(type)) return false;
    return hasSignedSession(req, secret, DateTime.utc());
  };
}
