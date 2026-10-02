// Уборщик брошенных загрузок (ADR-0137, ADR-0165): `uploading` без движения
// дольше срока — R2 и так держит брошенные части не дольше. Срок и размер пачки
// задаёт домен; шаги с его собственной логикой (срок хранения готовых файлов)
// остаются у домена.
import type { DateTime } from 'luxon';
import { discardUpload, type DiscardDeps } from './video-upload-discard';
import type { RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';

/** Брошенная загрузка живёт неделю (ADR-0137) — столько же R2 сам держит
 * брошенные части, продлевать смысла нет. Один срок на все виды видео. */
export const STALE_UPLOAD_DAYS = 7;

export interface SweepStaleInput {
  olderThanDays: number;
  /** Не «дай всё» (CLAUDE.md «API») — следующий тик доберёт остаток. */
  limit: number;
  now: DateTime;
}

/** Сколько загрузок убрано. */
export async function sweepStaleUploads<T extends VideoUploadRecord>(
  deps: DiscardDeps<T>,
  { olderThanDays, limit, now }: SweepStaleInput,
): Promise<number> {
  const boundary = now.minus({ days: olderThanDays }).toJSDate();
  const candidates = await deps.model
    .find(
      { status: 'uploading', updatedAt: { $lt: boundary } },
      { _id: 1, key: 1, uploadId: 1 },
    )
    .limit(limit)
    .lean<Pick<RawLeanVideoUpload, '_id' | 'key' | 'uploadId'>[]>();
  for (const doc of candidates) {
    await discardUpload(deps, doc, now, 'брошенную multipart-загрузку');
  }
  return candidates.length;
}
