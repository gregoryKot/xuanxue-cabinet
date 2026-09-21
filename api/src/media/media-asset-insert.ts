// Шифрование и запись одного media_assets — вынесено из MediaAssetsService
// (файл-лимит CLAUDE.md «Храповики»), тем же приёмом, что createAttempt
// (exams/exam-attempt-start.ts): бизнес-правила привязки (владение, itemId —
// ADR-0037, замена ссылки после graded — ADR-0086) остаются в сервисе, здесь
// только сама запись документа: insertMediaAsset — телеграм и ручная
// отметка (много записей без ограничения), upsertLinkMediaAsset — ссылка
// (одна на вопрос, повторная запись заменяет прежнюю).
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  EXAM_MEDIA_LINK_RACE_MESSAGE,
  type ExamMediaDto,
  type ExamMediaKind,
} from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
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

export interface UpsertLinkMediaAssetInput {
  attemptId: string;
  userId: string;
  itemId?: string;
  url: string;
  receivedAt: DateTime;
}

/** Ссылка на вопрос — upsert, не insert (ADR-0086): повторный вызов с тем же
 * (attemptId, itemId) заменяет прежнюю запись вместо второй, которая упёрлась
 * бы в уникальный индекс (media-asset.schema.ts). `itemId: null` в фильтре —
 * намеренно и явно, а не `undefined`: так матчатся и записи «со стыка
 * деплоя» без поля вовсе (ADR-0037 «Последствия»), не только с явным null, и
 * тот же литерал уходит в $setOnInsert — без второго решения, что писать при
 * вставке. Гонка двух параллельных upsert на пустом месте всё ещё может дать
 * E11000 — тот же отказ, что раньше при insertOne. */
export async function upsertLinkMediaAsset(
  model: Model<MediaAssetRecord>,
  data: UpsertLinkMediaAssetInput,
): Promise<ExamMediaDto> {
  const attemptId = new Types.ObjectId(data.attemptId);
  const itemId = data.itemId ? new Types.ObjectId(data.itemId) : null;
  // $set и $setOnInsert не пересекаются полями (Mongo иначе откажет на
  // конфликте путей): $set несёт то, что меняется при замене, $setOnInsert —
  // то, что задаёт саму связку и меняться не может.
  const set = encryptRecord(
    {
      userId: new Types.ObjectId(data.userId),
      url: data.url,
      receivedAt: data.receivedAt.toJSDate(),
    },
    MEDIA_ASSET_ENCRYPT_SCHEMA,
  );
  try {
    const doc = await model
      .findOneAndUpdate(
        { attemptId, itemId, kind: 'link' },
        { $set: set, $setOnInsert: { attemptId, itemId, kind: 'link' } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<RawLeanMediaAsset>();
    if (!doc)
      throw new Error('upsertLinkMediaAsset: запись не найдена сразу после записи');
    return toExamMediaDto(decryptMediaAsset(doc));
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new ConflictError(EXAM_MEDIA_LINK_RACE_MESSAGE);
    throw err;
  }
}
