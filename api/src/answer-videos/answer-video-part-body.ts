// Предикат для сырого парсера тела (app.setup.ts) — четвёртый маршрут
// сырого тела (SECURITY §4, ADR-0137), тем же приёмом, что
// exam-video-body.ts: метод, путь, заявленный тип, подписанная сессия
// последней. Заявленному типу не верим (SECURITY §4) — формат части решает
// сигнатура первого байта (answer-video-part.ts, `sniffVideoSignature`),
// здесь только включение парсера.
import { DateTime } from 'luxon';
import { hasSignedSession } from '../common/raw-body-session';
import { mediaType, routePath, type IncomingRequestLike } from '../common/raw-body-route';

const CONTENT_TYPE = 'application/octet-stream';
const PART_PATH_RE = /^\/api\/answer-videos\/[0-9a-f]{24}\/parts\/[0-9]{1,4}$/;

/** Фабрика — секрет сессии из DI замыкается один раз в app.setup.ts, тем же
 * приёмом, что makeIsExamVideoUpload. */
export function makeIsAnswerVideoPart(
  secret: string,
): (req: IncomingRequestLike) => boolean {
  return (req: IncomingRequestLike): boolean => {
    if ((req.method ?? '').toUpperCase() !== 'PUT') return false;
    if (!PART_PATH_RE.test(routePath(req.url))) return false;
    if (mediaType(req.headers['content-type']) !== CONTENT_TYPE) return false;
    return hasSignedSession(req, secret, DateTime.utc());
  };
}
