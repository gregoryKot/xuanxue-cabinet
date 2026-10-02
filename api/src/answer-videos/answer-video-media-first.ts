// Компенсация двойной вставки media на `complete` (F47, ревью #529): два
// complete по одному id — клиентский таймаут при ещё идущем на сервере
// запросе и повтор — оба читают «media ещё нет» и оба вставляют `kind: 'file'`.
// Уникального индекса на `answerVideoId` нет, и завести его сейчас нельзя: на
// проде могут быть дубли, IndexSyncService уронил бы старт. Поэтому
// победитель решается ПОСЛЕ вставки: первая по `_id` (порядок создания)
// остаётся, свою лишнюю проигравший удаляет сам и отдаёт победителя —
// уведомление учителю шлёт только победитель (answer-video-complete.ts).
//
// Остаточное окно: проигравший по `_id` перечитал раньше, чем вставка
// победителя стала видна (две вставки в разных соединениях пула) — тогда оба
// считают себя первыми, как было до компенсации. Закрывается только уникальным
// индексом после зачистки дублей на проде, отдельным решением.
import type { Model } from 'mongoose';
import type { ExamMediaDto } from '@xuanxue/shared';
import {
  decryptMediaAsset,
  toExamMediaDto,
  type RawLeanMediaAsset,
} from '../media/media-asset.mapper';
import type { MediaAssetRecord } from '../media/media-asset.schema';

export interface FirstFileMedia {
  media: ExamMediaDto;
  /** `false` — вставка конкурента оказалась раньше, своя удалена. */
  won: boolean;
}

export async function keepFirstFileMedia(
  mediaModel: Model<MediaAssetRecord>,
  answerVideoId: string,
  insertedId: string,
): Promise<FirstFileMedia> {
  // Строка, не ObjectId: приводит схема (answerVideoId — ObjectId в media_assets).
  const first = await mediaModel
    .findOne({ answerVideoId, kind: 'file' })
    .sort({ _id: 1 })
    .lean<RawLeanMediaAsset | null>();
  // Своя вставка только что прошла — пусто быть не может; защита в глубину
  // тем же приёмом, что insertMediaAsset.
  if (!first) throw new Error('keepFirstFileMedia: media не найдена сразу после вставки');
  const won = first._id.toString() === insertedId;
  if (!won) await mediaModel.deleteOne({ _id: insertedId });
  return { media: toExamMediaDto(decryptMediaAsset(first)), won };
}
