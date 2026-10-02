// Запись `media_assets` под загруженный видео-ответ и замена прежнего файла —
// вторая половина `complete` после сборки в R2 (ADR-0137). Каждый шаг повторяем:
// повтор `complete` после сбоя Mongo (ADR-0165, F47 аудита 2026-10-01) приходит
// сюда с уже сделанной частью работы и не должен ни стереть собственный файл,
// ни завести вторую запись.
//
// Новый файл к тому же вопросу заменяет прежний файл, пока работу не
// проверили (ADR-0086, тот же приём, что upsertLinkMediaAsset у ссылки) —
// здесь явным поиском и удалением, не upsert по индексу: у `kind: 'file'`
// своего уникального индекса на (attemptId, itemId) нет.
import type { Model, Types } from 'mongoose';
import type { DateTime } from 'luxon';
import type { ExamMediaDto } from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { insertMediaAsset } from '../media/media-asset-insert';
import {
  decryptMediaAsset,
  toExamMediaDto,
  type RawLeanMediaAsset,
} from '../media/media-asset.mapper';
import type { MediaAssetRecord } from '../media/media-asset.schema';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import type { AnswerVideoRecord, RawLeanAnswerVideo } from './answer-video.schema';

export interface AttachDeps {
  model: Model<AnswerVideoRecord>;
  mediaModel: Model<MediaAssetRecord>;
  orphans: StorageOrphansService;
}

/** Запись о файле этого видео или `null`, если её нет. */
export async function findFileMedia(
  mediaModel: Model<MediaAssetRecord>,
  answerVideoId: Types.ObjectId,
): Promise<ExamMediaDto | null> {
  const raw = await mediaModel
    .findOne({ answerVideoId, kind: 'file' })
    .lean<RawLeanMediaAsset | null>();
  return raw ? toExamMediaDto(decryptMediaAsset(raw)) : null;
}

/** Убирает прежний файл к тому же вопросу и записывает этот. Повтор отдаёт
 * уже созданную запись. Запись получает `_id` видео: гонка двух `complete` упрётся
 * в уникальность `_id`, а не создаст вторую запись, и без нового индекса,
 * который при выкате мог бы не собраться на старых данных. */
export async function attachFileMedia(
  deps: AttachDeps,
  doc: RawLeanAnswerVideo,
  now: DateTime,
): Promise<ExamMediaDto> {
  await replacePreviousFile(deps, doc, now);
  const existing = await findFileMedia(deps.mediaModel, doc._id);
  if (existing) return existing;
  try {
    return await insertMediaAsset(deps.mediaModel, {
      id: doc._id.toString(),
      attemptId: doc.attemptId.toString(),
      userId: doc.userId.toString(),
      itemId: doc.itemId.toString(),
      kind: 'file',
      sizeBytes: doc.sizeBytes,
      answerVideoId: doc._id.toString(),
      receivedAt: now,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const raced = await findFileMedia(deps.mediaModel, doc._id);
    if (!raced) throw err;
    return raced;
  }
}

/** Заменяет предыдущий файл к тому же вопросу (ADR-0086/ADR-0137) — байты
 * старого убираются журналом сирот, документы обоих коллекций удаляются.
 * Собственная запись видео исключена из выборки: при повторе она уже есть, и
 * без исключения повтор убрал бы только что собранный файл. */
async function replacePreviousFile(
  { model, mediaModel, orphans }: AttachDeps,
  doc: RawLeanAnswerVideo,
  now: DateTime,
): Promise<void> {
  const others = {
    attemptId: doc.attemptId,
    itemId: doc.itemId,
    kind: 'file' as const,
    answerVideoId: { $ne: doc._id },
  };
  const previous = await mediaModel
    .find(others)
    .lean<{ answerVideoId?: Types.ObjectId }[]>();
  for (const prev of previous) {
    if (!prev.answerVideoId) continue;
    const prevVideo = await model
      .findById(prev.answerVideoId)
      .lean<RawLeanAnswerVideo | null>();
    if (!prevVideo) continue;
    await orphans.removeNow(prevVideo.key, now);
    await model.deleteOne({ _id: prevVideo._id });
  }
  await mediaModel.deleteMany(others);
}
