// Шифрование и запись одного media_assets — вынесено из MediaAssetsService
// (файл-лимит CLAUDE.md «Храповики»), тем же приёмом, что createAttempt
// (exams/exam-attempt-start.ts): бизнес-правила привязки (владение, itemId —
// ADR-0037) остаются в сервисе, здесь только сама запись документа.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { DateTime } from 'luxon';
import type { ExamMediaDto, ExamMediaKind } from '@xuanxue/shared';
import { encryptRecord } from '../utils/encryption';
import {
  decryptMediaAsset,
  toExamMediaDto,
  type RawLeanMediaAsset,
} from './media-asset.mapper';
import { MEDIA_ASSET_ENCRYPT_SCHEMA, type MediaAssetRecord } from './media-asset.schema';

export interface MediaAssetInsert {
  attemptId: string;
  userId: string;
  itemId?: string;
  kind: ExamMediaKind;
  fileId?: string;
  fileUniqueId?: string;
  url?: string;
  durationSec?: number;
  sizeBytes?: number;
  note?: string;
  receivedAt: DateTime;
}

export async function insertMediaAsset(
  model: Model<MediaAssetRecord>,
  data: MediaAssetInsert,
): Promise<ExamMediaDto> {
  const payload = encryptRecord(
    {
      attemptId: new Types.ObjectId(data.attemptId),
      userId: new Types.ObjectId(data.userId),
      itemId: data.itemId ? new Types.ObjectId(data.itemId) : undefined,
      kind: data.kind,
      fileId: data.fileId,
      fileUniqueId: data.fileUniqueId,
      url: data.url,
      durationSec: data.durationSec,
      sizeBytes: data.sizeBytes,
      note: data.note,
      receivedAt: data.receivedAt.toJSDate(),
    },
    MEDIA_ASSET_ENCRYPT_SCHEMA,
  );
  const created = await model.create(payload);
  const doc = await model.findById(created._id).lean<RawLeanMediaAsset>();
  if (!doc) throw new Error('insertMediaAsset: запись не найдена сразу после создания');
  return toExamMediaDto(decryptMediaAsset(doc));
}
