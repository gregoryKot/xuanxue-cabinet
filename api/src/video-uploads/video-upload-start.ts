// Начать или продолжить загрузку (ADR-0137, ADR-0165): общее для всех видов
// видео. Домен решает, какая незаконченная загрузка считается «той же» (ученик +
// попытка + вопрос) и какими полями владения создать новую; ядро — что с
// найденной делать и как заводить документ.
import { randomUUID } from 'crypto';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { VideoUploadDto } from '@xuanxue/shared';
import { discardUpload, type DiscardDeps } from './video-upload-discard';
import { toVideoUploadDto, type RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord, VideoUploadStatus } from './video-upload.schema';

/** Состояние загрузки, которое задаёт ядро; остальные поля нового документа
 * (владение) домен добавляет сам. */
interface NewUploadState {
  key: string;
  sizeBytes: number;
  fingerprint: string;
  status: VideoUploadStatus;
}

export interface StartUploadInput {
  /** Незаконченная загрузка «того же места», которую нашёл домен, или `null`. */
  existing: RawLeanVideoUpload | null;
  sizeBytes: number;
  fingerprint: string;
  /** Каталог ключей в R2: `answer-videos`, дальше `exam-videos`. */
  keyPrefix: string;
  create: (state: NewUploadState) => Promise<{ _id: Types.ObjectId }>;
  now: DateTime;
}

export async function startVideoUpload<T extends VideoUploadRecord>(
  deps: DiscardDeps<T>,
  { existing, sizeBytes, fingerprint, keyPrefix, create, now }: StartUploadInput,
): Promise<VideoUploadDto> {
  if (
    existing &&
    existing.sizeBytes === sizeBytes &&
    existing.fingerprint === fingerprint
  ) {
    // Тот же файл к тому же месту — продолжаем (ADR-0137), не начинаем
    // новую загрузку и не открываем второй multipart в R2.
    return toVideoUploadDto(existing);
  }
  // Другой файл пришёл заново (например, вкладку закрыли и выбрали другое
  // видео) — прежняя незаконченная загрузка ни к чему, убираем best-effort:
  // отказ хранилища не должен блокировать новую попытку загрузить файл.
  if (existing) await discardUpload(deps, existing, now, 'прежнюю multipart-загрузку');

  const key = `${keyPrefix}/${randomUUID()}`;
  // Журнал сирот — раньше самого документа (ADR-0079): ключ выбран, но в
  // R2 ещё ничего нет (multipart откроется на первой части) — упади
  // создание документа прямо сейчас, ключ всё равно не потеряется.
  await deps.orphans.track(key);
  const created = await create({ key, sizeBytes, fingerprint, status: 'uploading' });
  const doc = await deps.model.findById(created._id).lean<RawLeanVideoUpload>();
  if (!doc) throw new Error('startVideoUpload: запись не найдена сразу после создания');
  return toVideoUploadDto(doc);
}
