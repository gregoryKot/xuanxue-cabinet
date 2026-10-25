// Байты видео со своего домена, с проходом `Range` (ADR-0182): браузер штата
// снимает кадр-превью декодером, а кадр из `<video src>` на чужом домене R2 на
// холст не рисуется (tainted canvas, CORS у бакета не настроен, ADR-0133). Общее
// для всех видов видео — разбор `Range` и заголовки ответа; права проверяет
// сервис своего вида (SignedVideoService.openBytes), здесь их нет.
import type { RedirectResponseLike } from '../common/video-redirect';
import { InvalidInputError } from '../common/errors';
import type { ObjectStream } from '../storage/file-store.service';

// VOICE: что не так и что делать. Сюда попадает только кривой клиент: браузерный
// декодер сам шлёт нормальный `Range`.
export const VIDEO_RANGE_INVALID_MESSAGE =
  'Не удалось прочитать запрошенную часть видео. Откройте экран заново и повторите.';

// Только три формы из RFC 9110: `a-b`, `a-` и `-n`. Одна пара границ, без списка
// диапазонов: произвольный заголовок в R2 мы не проксируем (ADR-0182).
const RANGE_RE = /^bytes=(?:(\d{1,15})-(\d{1,15})?|-(\d{1,15}))$/;

/** `undefined` — заголовка нет, берём объект целиком. Кривой или перевёрнутый
 * (`bytes=9-3`) — 400, а не тихое «целиком»: 50 МБ в ответ на опечатку клиента. */
export function parseVideoRange(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = RANGE_RE.exec(header);
  if (!match) throw new InvalidInputError(VIDEO_RANGE_INVALID_MESSAGE);
  const [, first, last] = match;
  if (first !== undefined && last !== undefined && Number(first) > Number(last)) {
    throw new InvalidInputError(VIDEO_RANGE_INVALID_MESSAGE);
  }
  return header;
}

/** Статус и заголовки ответа R2 переходят на наш ответ как есть: `Content-Range`
 * нужен декодеру, чтобы узнать полный размер. `no-store` и `private` — ответ
 * проверен по праву штата и в общий кеш не идёт. */
export function applyVideoBytesHeaders(
  res: RedirectResponseLike,
  stream: Pick<ObjectStream, 'status' | 'contentLength' | 'contentRange'> & {
    contentType: string | undefined;
  },
): void {
  res.status(stream.status);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');
  if (stream.contentType) res.setHeader('Content-Type', stream.contentType);
  if (stream.contentLength) res.setHeader('Content-Length', stream.contentLength);
  if (stream.contentRange) res.setHeader('Content-Range', stream.contentRange);
}
