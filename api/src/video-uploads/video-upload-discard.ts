// Убрать незаконченную загрузку: прервать multipart в R2, убрать объект
// журналом сирот, удалить документ. Общее для «начали другой файл»
// (video-upload-start.ts) и уборщика брошенных загрузок (video-upload-stale.ts).
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { errorMessage } from '../common/error-info';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import type { RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';

const logger = new Logger('VideoUploads');

export interface DiscardDeps<T extends VideoUploadRecord> {
  model: Model<T>;
  multipart: MultipartStoreService;
  orphans: StorageOrphansService;
}

/** Best-effort: брошенная загрузка не должна блокировать основной поток —
 * отказ R2 оставляет часть оплаченного хранилища брошенной части, не
 * пользовательскую операцию. `what` — что прерывали, в строку лога. */
export async function abortQuietly(
  multipart: MultipartStoreService,
  upload: Pick<RawLeanVideoUpload, 'key' | 'uploadId'>,
  now: DateTime,
  what: string,
): Promise<void> {
  if (!upload.uploadId) return;
  try {
    await multipart.abortMultipartUpload(upload.key, upload.uploadId, now);
  } catch (err) {
    logger.warn(`не удалось прервать ${what}: ${errorMessage(err)}`);
  }
}

export async function discardUpload<T extends VideoUploadRecord>(
  { model, multipart, orphans }: DiscardDeps<T>,
  upload: Pick<RawLeanVideoUpload, '_id' | 'key' | 'uploadId'>,
  now: DateTime,
  what: string,
): Promise<void> {
  await abortQuietly(multipart, upload, now, what);
  await orphans.removeNow(upload.key, now);
  await model.deleteOne({ _id: upload._id });
}
