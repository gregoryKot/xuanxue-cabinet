// Список media_assets по попыткам — вынесено из MediaAssetsService (файл-лимит
// CLAUDE.md «Храповики»), тем же приёмом, что media-asset-insert.ts: здесь
// только запрос, расшифровка и группировка по попытке.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { ExamMediaDto } from '@xuanxue/shared';
import {
  decryptMediaAsset,
  toExamMediaDto,
  type RawLeanMediaAsset,
} from './media-asset.mapper';
import type { MediaAssetRecord } from './media-asset.schema';

/** Один запрос на список попыток (учитель, `GET /attempts`) — не N+1. */
export async function listMediaForAttempts(
  model: Model<MediaAssetRecord>,
  attemptIds: string[],
): Promise<Map<string, ExamMediaDto[]>> {
  const ids = attemptIds.filter((id) => Types.ObjectId.isValid(id));
  const byAttempt = new Map<string, ExamMediaDto[]>();
  if (ids.length === 0) return byAttempt;

  const docs = await model
    .find({ attemptId: { $in: ids } })
    .sort({ receivedAt: -1 })
    .lean<RawLeanMediaAsset[]>();
  for (const doc of docs) {
    const key = doc.attemptId.toString();
    const dto = toExamMediaDto(decryptMediaAsset(doc));
    byAttempt.set(key, [...(byAttempt.get(key) ?? []), dto]);
  }
  return byAttempt;
}
