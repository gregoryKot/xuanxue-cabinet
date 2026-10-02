// Предикат для сырого парсера тела (app.setup.ts) — маршруты частей видео,
// последний вид сырого тела (SECURITY §4, ADR-0137), тем же приёмом, что
// exam-image-body.ts и material-file-body.ts: метод, путь, заявленный тип,
// подписанная сессия последней. Заявленному типу не верим (SECURITY §4) — формат части решает
// сигнатура первого байта (video-upload-part.ts, `sniffVideoSignature`),
// здесь только включение парсера.
//
// Один предикат на все виды видео (ADR-0165): новый вид добавляет шаблон пути
// в VIDEO_PART_PATH_PATTERNS, а не второй предикат.
import { DateTime } from 'luxon';
import { hasSignedSession } from '../common/raw-body-session';
import { mediaType, routePath, type IncomingRequestLike } from '../common/raw-body-route';

const CONTENT_TYPE = 'application/octet-stream';

/** Маршруты `PUT …/:id/parts/:n` всех видов видео: ответ ученика (ADR-0137) и
 * видео вопроса (ADR-0165). */
export const VIDEO_PART_PATH_PATTERNS: readonly RegExp[] = [
  /^\/api\/answer-videos\/[0-9a-f]{24}\/parts\/[0-9]{1,4}$/,
  /^\/api\/exam-videos\/[0-9a-f]{24}\/parts\/[0-9]{1,4}$/,
];

/** Фабрика — секрет сессии из DI замыкается один раз в app.setup.ts, тем же
 * приёмом, что makeIsMaterialFileUpload. */
export function makeIsVideoPart(
  secret: string,
  pathPatterns: readonly RegExp[],
): (req: IncomingRequestLike) => boolean {
  return (req: IncomingRequestLike): boolean => {
    if ((req.method ?? '').toUpperCase() !== 'PUT') return false;
    const path = routePath(req.url);
    if (!pathPatterns.some((pattern) => pattern.test(path))) return false;
    if (mediaType(req.headers['content-type']) !== CONTENT_TYPE) return false;
    return hasSignedSession(req, secret, DateTime.utc());
  };
}
