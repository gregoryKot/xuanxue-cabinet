// Кадр-превью видео (ADR-0165): приходит в теле `complete` как base64 JPEG,
// проверяется здесь одним местом для обоих видов видео и ложится в запись того же
// видео. Неверный кадр — 400 ДО сборки файла в R2: видео остаётся незавершённым и
// его можно завершить повтором без кадра (кадр — украшение, не условие).
import type { Model } from 'mongoose';
import {
  VIDEO_POSTER_LIMITS,
  VIDEO_POSTER_NOT_JPEG_MESSAGE,
  VIDEO_POSTER_TOO_LARGE_MESSAGE,
} from '@xuanxue/shared';
import { binaryToBuffer } from '../common/binary-to-buffer';
import { InvalidInputError } from '../common/errors';
import type { VideoUploadRecord } from './video-upload.schema';

// Сигнатура JPEG: маркер начала изображения и начало следующего сегмента.
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function isJpeg(bytes: Buffer): boolean {
  return JPEG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Кадр из тела запроса: `undefined` — кадра нет. Заголовку и расширению не
 * верим (SECURITY §4): тип решают первые байты. */
export function parseVideoPoster(base64: string | undefined): Buffer | undefined {
  if (base64 === undefined) return undefined;
  const bytes = Buffer.from(base64, 'base64');
  if (!isJpeg(bytes)) throw new InvalidInputError(VIDEO_POSTER_NOT_JPEG_MESSAGE);
  if (bytes.length > VIDEO_POSTER_LIMITS.maxBytes) {
    throw new InvalidInputError(VIDEO_POSTER_TOO_LARGE_MESSAGE);
  }
  return bytes;
}

/** Кадр для видео, которое уже готово: повтор `complete` или проигранная гонка
 * двух `complete`. Ставится, только пока кадра нет, — первый записанный не
 * перетирается, повтор идемпотентен. */
export async function setPosterIfAbsent<T extends VideoUploadRecord>(
  model: Model<T>,
  id: string,
  poster: Buffer | undefined,
): Promise<void> {
  if (!poster) return;
  await model.updateOne({ _id: id, poster: { $exists: false } }, { $set: { poster } });
}

/** Кадр из записи, прочитанной с `+poster`; `null` — у видео его нет (старое или
 * завершённое без кадра). Запись из `.lean()` несёт Binary, не Buffer. */
export function readPoster(doc: { poster?: unknown }): Buffer | null {
  return doc.poster ? binaryToBuffer(doc.poster) : null;
}
