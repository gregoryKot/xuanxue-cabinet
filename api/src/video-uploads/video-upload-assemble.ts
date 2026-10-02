// Сборка загруженного видео в R2 на `complete` (ADR-0137, повторяемость —
// ADR-0165): CompleteMultipartUpload и отметка `r2CompletedAt` в документе.
// Общее для всех видов видео: что делать с собранным файлом (запись в
// `media_assets`, уведомление, `ready`), решает домен после вызова.
//
// Почему повторяемо (аудит 2026-10-01, F47). R2 собирает загрузку один раз:
// второй вызов отвечает NoSuchUpload. Если после сборки упала Mongo, клиент
// повторял `complete`, получал 503 и крутился в «Связь пропала» вечно, хотя файл
// лежал в R2, а записи о нём не было. Теперь после ответа R2 пишется отметка,
// и повтор шаг в R2 пропускает. А если не записалась и сама отметка, NoSuchUpload
// разбирается проверкой объекта: он лежит с нужным размером — значит, собран.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ANSWER_VIDEO_PARTS_MISSING_MESSAGE } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import { MultipartUploadGoneError } from '../storage/r2-errors';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { partCountFor, type RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';

const logger = new Logger('VideoUploads');

export interface AssembleDeps<T extends VideoUploadRecord> {
  model: Model<T>;
  multipart: MultipartStoreService;
  objectHead: ObjectHeadService;
  orphans: StorageOrphansService;
}

/** Все части на месте — собирать можно. Отдельной функцией, а не частью
 * `assembleVideoUpload`: домен вызывает её в своём порядке отказов (сначала
 * «не все части», потом владение попытки, статус проверки). */
export function assertAllPartsReceived(doc: RawLeanVideoUpload): void {
  const received = new Set(doc.parts.map((part) => part.n));
  for (let n = 1; n <= partCountFor(doc.sizeBytes); n += 1) {
    if (!received.has(n)) throw new ConflictError(ANSWER_VIDEO_PARTS_MISSING_MESSAGE);
  }
}

/** После вызова файл гарантированно лежит в R2, а в документе стоит
 * `r2CompletedAt`. Журнал сирот отпускается тут же: с отметкой владелец
 * ключа — сам документ `uploading`, и уборщик брошенных загрузок
 * (video-upload-stale.ts) убирает ключ вместе с ним. Оставь ключ в журнале —
 * он через сутки удалил бы собранный файл у того, кто вернулся позже. */
export async function assembleVideoUpload<T extends VideoUploadRecord>(
  deps: AssembleDeps<T>,
  doc: RawLeanVideoUpload,
  uploadId: string,
  now: DateTime,
): Promise<void> {
  if (!doc.r2CompletedAt) {
    await assembleInStorage(deps, doc, uploadId, now);
    await deps.model.updateOne(
      { _id: doc._id },
      { $set: { r2CompletedAt: now.toJSDate() } },
    );
  }
  await deps.orphans.forget(doc.key);
}

async function assembleInStorage<T extends VideoUploadRecord>(
  { multipart, objectHead, orphans }: AssembleDeps<T>,
  doc: RawLeanVideoUpload,
  uploadId: string,
  now: DateTime,
): Promise<void> {
  // ADR-0079: журнал раньше завершения — ключ уже создан на старте, но
  // отметить его снова (upsert) перед решающим шагом безопаснее, чем
  // положиться на запись недельной давности.
  await orphans.track(doc.key);
  try {
    await multipart.completeMultipartUpload({
      key: doc.key,
      uploadId,
      parts: [...doc.parts]
        .sort((a, b) => a.n - b.n)
        .map((part) => ({ partNumber: part.n, etag: part.etag })),
      now,
    });
  } catch (err) {
    if (!(err instanceof MultipartUploadGoneError)) throw err;
    // Загрузки нет, а объекта с нужным размером тоже нет — это настоящая
    // потеря, ошибка уходит как раньше, а не прячется.
    if ((await objectHead.sizeBytes(doc.key, now)) !== doc.sizeBytes) throw err;
    logger.warn('R2 уже собрал файл, отметка не записалась — продолжаем (F47)');
  }
}
