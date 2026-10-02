// Конец загрузки (ADR-0137, ADR-0165): условный переход `uploading → ready` вместе
// с кадром-превью — одним местом для обоих видов видео. Что делать с готовым
// файлом дальше (уведомление, запись в `media_assets`), решает домен по ответу.
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { setPosterIfAbsent } from './video-poster';
import type { VideoUploadRecord } from './video-upload.schema';

export interface MarkReadyInput {
  now: DateTime;
  /** Разобранный кадр из тела `complete` (parseVideoPoster) или `undefined`. */
  poster: Buffer | undefined;
}

/** Переход делает один из параллельных `complete`: `true` — этот вызов, ему и
 * уведомлять. Проигравший не теряет кадр, который пришёл с ним (ставится, если
 * у победителя его не было). Служебные поля закрытой загрузки снимаются. */
export async function markVideoReady<T extends VideoUploadRecord>(
  model: Model<T>,
  id: Types.ObjectId,
  { now, poster }: MarkReadyInput,
): Promise<boolean> {
  const moved = await model.updateOne(
    { _id: id, status: 'uploading' },
    {
      $set: {
        status: 'ready',
        completedAt: now.toJSDate(),
        parts: [],
        ...(poster ? { poster } : {}),
      },
      $unset: { uploadId: 1, r2CompletedAt: 1 },
    },
  );
  if (moved.modifiedCount > 0) return true;
  await setPosterIfAbsent(model, id.toString(), poster);
  return false;
}
