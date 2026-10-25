// Конец загрузки видео школы (`complete`, ADR-0165): общее для видов видео, которые
// грузит штат (видео вопроса и следующие). Кто вправе — решил домен до вызова (владелец загрузки); что
// отдать клиенту — решает он же по возвращённой записи (свой DTO).
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ANSWER_VIDEO_PART_INVALID_MESSAGE } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { parseVideoPoster, setPosterIfAbsent } from './video-poster';
import { assertAllPartsReceived } from './video-upload-assemble';
import { markVideoReady } from './video-upload-ready';
import type { RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';

export interface CompleteDeps<T extends VideoUploadRecord> {
  model: Model<T>;
  /** Сборка файла в R2 (VideoUploadsService.assemble). */
  assemble: (doc: RawLeanVideoUpload, uploadId: string, now: DateTime) => Promise<void>;
}

export interface CompleteInput {
  /** Кадр-превью из тела запроса, base64, или `undefined`. */
  posterBase64: string | undefined;
  now: DateTime;
}

/** Готовая запись видео. `L` — форма записи в `.lean()` вида видео: ядро возвращает
 * её же, чтобы домену не приводить типы. */
export async function completeVideoUpload<
  T extends VideoUploadRecord,
  L extends RawLeanVideoUpload,
>(
  { model, assemble }: CompleteDeps<T>,
  doc: L,
  { posterBase64, now }: CompleteInput,
): Promise<L> {
  // Неверный кадр — 400 до сборки в R2: видео остаётся незавершённым, и его
  // завершает повтор без кадра (ADR-0165).
  const poster = parseVideoPoster(posterBase64);
  // Готовое видео на повторе отдаёт тот же ответ: ответ первого вызова мог
  // потеряться по дороге (F47, ADR-0165). Кадр, которого у него ещё нет, ставится.
  if (doc.status !== 'uploading') {
    await setPosterIfAbsent(model, doc._id.toString(), poster);
    return doc;
  }
  if (!doc.uploadId) throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
  assertAllPartsReceived(doc);
  await assemble(doc, doc.uploadId, now);
  // Из двух параллельных `complete` переход делает один; ответ оба строят из
  // одной записи.
  await markVideoReady(model, doc._id, { now, poster });
  const ready = await model.findById(doc._id).lean<L | null>();
  if (!ready) throw new Error('completeVideoUpload: запись пропала во время завершения');
  return ready;
}
