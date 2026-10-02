// Принять одну часть файла (ADR-0137, ADR-0165): общее для всех видов видео.
// Кто вправе слать часть — решает домен до вызова (владелец, роль), сюда
// приходит уже найденный документ.
//
// Заголовку `Content-Type` не верим (SECURITY §4): первая часть проходит
// `sniffVideoSignature`, и только её результат открывает multipart-загрузку
// в R2 — части после первой без неё не принимаются
// (ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE).
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE,
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  EXAM_VIDEO_EMPTY_MESSAGE,
  EXAM_VIDEO_UNSUPPORTED_MESSAGE,
  type VideoUploadDto,
} from '@xuanxue/shared';
import { ConflictError, InvalidInputError } from '../common/errors';
import { sniffVideoSignature } from '../common/raw-upload';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import { abortQuietly } from './video-upload-discard';
import {
  partCountFor,
  toVideoUploadDto,
  type RawLeanVideoUpload,
} from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';

export interface PartDeps<T extends VideoUploadRecord> {
  model: Model<T>;
  multipart: MultipartStoreService;
}

export interface UploadPartInput {
  doc: RawLeanVideoUpload;
  partNumber: number;
  body: unknown;
  now: DateTime;
}

export async function uploadVideoPart<T extends VideoUploadRecord>(
  deps: PartDeps<T>,
  { doc, partNumber, body, now }: UploadPartInput,
): Promise<VideoUploadDto> {
  // r2CompletedAt: файл в R2 уже собран (ADR-0165) — часть 1 открыла бы
  // вторую загрузку на тот же ключ, и она осталась бы брошенной.
  if (doc.status !== 'uploading' || doc.r2CompletedAt) {
    throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
  }
  const partCount = partCountFor(doc.sizeBytes);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    throw new InvalidInputError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
  }
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new InvalidInputError(EXAM_VIDEO_EMPTY_MESSAGE);
  }
  const expectedLength =
    partNumber < partCount
      ? ANSWER_VIDEO_LIMITS.partBytes
      : doc.sizeBytes - ANSWER_VIDEO_LIMITS.partBytes * (partCount - 1);
  if (body.length !== expectedLength) {
    throw new InvalidInputError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
  }

  const uploadId =
    partNumber === 1 ? await openOrReuseUpload(deps, doc, body, now) : doc.uploadId;
  if (!uploadId) {
    throw new ConflictError(ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE);
  }

  const etag = await deps.multipart.uploadPart({
    key: doc.key,
    uploadId,
    partNumber,
    bytes: body,
    now,
  });
  await upsertPart(deps.model, doc._id.toString(), partNumber, etag);

  const final = await deps.model.findById(doc._id).lean<RawLeanVideoUpload>();
  if (!final) throw new Error('uploadVideoPart: запись пропала во время загрузки');
  return toVideoUploadDto(final);
}

/** Первая часть открывает multipart в R2 сигнатурой сниффа, не заголовком
 * клиента. Условный апдейт `uploadId: { $exists: false }` страхует гонку
 * двух параллельных первых частей — проигравший прерывает свой multipart
 * и берёт uploadId победителя. */
async function openOrReuseUpload<T extends VideoUploadRecord>(
  { model, multipart }: PartDeps<T>,
  doc: RawLeanVideoUpload,
  bytes: Buffer,
  now: DateTime,
): Promise<string | undefined> {
  const sniffed = sniffVideoSignature(bytes);
  if (!sniffed) throw new InvalidInputError(EXAM_VIDEO_UNSUPPORTED_MESSAGE);
  if (doc.uploadId) return doc.uploadId;

  const uploadId = await multipart.createMultipartUpload(doc.key, sniffed, now);
  const updated = await model
    .findOneAndUpdate(
      { _id: doc._id, uploadId: { $exists: false } },
      { $set: { uploadId, contentType: sniffed } },
    )
    .lean<RawLeanVideoUpload | null>();
  if (updated) return uploadId;

  // Проиграли гонку — другой запрос уже открыл multipart раньше нас.
  await abortQuietly(multipart, { key: doc.key, uploadId }, now, 'проигравший multipart');
  const fresh = await model.findById(doc._id).lean<RawLeanVideoUpload | null>();
  return fresh?.uploadId;
}

async function upsertPart<T extends VideoUploadRecord>(
  model: Model<T>,
  id: string,
  n: number,
  etag: string,
): Promise<void> {
  const replaced = await model.updateOne(
    { _id: id, 'parts.n': n },
    { $set: { 'parts.$.etag': etag } },
  );
  if (replaced.matchedCount === 0) {
    await model.updateOne({ _id: id }, { $push: { parts: { n, etag } } });
  }
}
