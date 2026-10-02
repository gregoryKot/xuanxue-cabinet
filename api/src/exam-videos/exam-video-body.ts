// Предикат для сырого парсера тела (app.setup.ts) — прежняя загрузка видео
// одним телом; уйдёт вместе с этим файлом, когда web перейдёт на части
// (ADR-0165, video-uploads/video-upload-part-body.ts). Третий потребитель этой
// механики после картинок вариантов (exam-image-body.ts, ADR-0035) и файлов
// материалов (material-file-body.ts, ADR-0057). Сырое тело включается по
// маршруту и заявленному типу, а не по `video/*` глобально — та же причина,
// что у обоих файлов выше: иначе такое тело в ЛЮБОМ запросе (в том числе на
// чужой маршрут) превращалось бы в Buffer, и ValidationPipe
// (whitelist/forbidNonWhitelisted) перебирал бы его как «лишние поля».
//
// Заявленному типу всё равно не верим: формат решает сигнатура байтов
// (exam-video-upload.ts). Здесь он только включает парсер.
//
// Последняя проверка — подписанная сессия (SECURITY §4, ADR-0083, мера 1),
// та же, что у обоих файлов выше: дешёвая HMAC-проверка ставится последней,
// после метода/пути/типа.
import { DateTime } from 'luxon';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { hasSignedSession } from '../common/raw-body-session';
import { mediaType, routePath, type IncomingRequestLike } from '../common/raw-body-route';

export const EXAM_VIDEOS_ROUTE_PATH = '/api/exam-videos';

const UPLOAD_PATH_RE = new RegExp(`^${EXAM_VIDEOS_ROUTE_PATH}$`);

function isExamVideoContentType(value: string): value is ExamVideoContentType {
  return (EXAM_VIDEO_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Фабрика вместо голой функции — та же причина, что у
 * `makeIsMaterialFileUpload`/`makeIsRawImageUpload`: секрет сессии из DI
 * замыкается один раз в app.setup.ts, предикат зовётся на каждый запрос. */
export function makeIsExamVideoUpload(
  secret: string,
): (req: IncomingRequestLike) => boolean {
  return (req: IncomingRequestLike): boolean => {
    if ((req.method ?? '').toUpperCase() !== 'POST') return false;
    if (!UPLOAD_PATH_RE.test(routePath(req.url))) return false;
    if (!isExamVideoContentType(mediaType(req.headers['content-type']))) return false;
    return hasSignedSession(req, secret, DateTime.utc());
  };
}
