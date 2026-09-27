// POST /answer-videos/:id/complete (ADR-0137) — завершить multipart-загрузку
// в R2 и превратить видео-ответ в `media_assets` (`kind: 'file'`). Вынесено
// из AnswerVideosService (файл-лимит CLAUDE.md «Храповики»).
//
// Новый файл к тому же вопросу заменяет прежний файл, пока работу не
// проверили (ADR-0086, тот же приём, что upsertLinkMediaAsset у ссылки) —
// здесь явным поиском и удалением, не upsert по индексу: у `kind: 'file'`
// своего уникального индекса на (attemptId, itemId) нет, запись создаёт этот
// же вызов, а не гонка параллельных upsert.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  ANSWER_VIDEO_NOT_FOUND_MESSAGE,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  ANSWER_VIDEO_PARTS_MISSING_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { assertObjectId } from '../common/object-id';
import { ConflictError, NotFoundError } from '../common/errors';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { insertMediaAsset } from '../media/media-asset-insert';
import { MediaAssetRecord } from '../media/media-asset.schema';
import { loadAttemptOwnerInfo } from '../media/media-attempt-owner';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import { notifyVideoAdded } from '../media/notify-video-link-added';
import { MultipartStoreService } from '../storage/multipart-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { partCountFor, type RawLeanAnswerVideo } from './answer-video.mapper';
import { AnswerVideoRecord } from './answer-video.schema';

@Injectable()
export class AnswerVideoCompleteService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(MediaAssetRecord.name)
    private readonly mediaModel: Model<MediaAssetRecord>,
    private readonly multipart: MultipartStoreService,
    private readonly orphans: StorageOrphansService,
    private readonly notifiers: ExamMediaNotifierRegistry,
  ) {}

  async complete(id: string, userId: string, now: DateTime): Promise<ExamMediaDto> {
    assertObjectId(id, ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanAnswerVideo | null>();
    if (!doc || doc.userId.toString() !== userId) {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    if (doc.status !== 'uploading' || !doc.uploadId) {
      throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    }
    const partCount = partCountFor(doc.sizeBytes);
    const received = new Set(doc.parts.map((part) => part.n));
    for (let n = 1; n <= partCount; n += 1) {
      if (!received.has(n)) throw new ConflictError(ANSWER_VIDEO_PARTS_MISSING_MESSAGE);
    }

    const attemptId = doc.attemptId.toString();
    const itemId = doc.itemId.toString();
    const owner = await loadAttemptOwnerInfo(this.attemptModel, attemptId);
    if (!owner || owner.userId !== userId) {
      throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    }
    if (owner.status === 'graded') {
      throw new ConflictError(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE);
    }

    // ADR-0079: журнал раньше завершения — ключ уже создан на старте, но
    // отметить его снова (upsert) перед решающим шагом безопаснее, чем
    // положиться на запись недельной давности.
    await this.orphans.track(doc.key);
    await this.multipart.completeMultipartUpload({
      key: doc.key,
      uploadId: doc.uploadId,
      parts: [...doc.parts]
        .sort((a, b) => a.n - b.n)
        .map((part) => ({ partNumber: part.n, etag: part.etag })),
      now,
    });

    await this.replacePreviousFile(attemptId, itemId, now);
    const media = await insertMediaAsset(this.mediaModel, {
      attemptId,
      userId,
      itemId,
      kind: 'file',
      sizeBytes: doc.sizeBytes,
      answerVideoId: doc._id.toString(),
      receivedAt: now,
    });

    await this.model.updateOne(
      { _id: doc._id },
      {
        $set: { status: 'ready', completedAt: now.toJSDate(), parts: [] },
        $unset: { uploadId: 1 },
      },
    );
    await this.orphans.forget(doc.key);
    notifyVideoAdded(this.notifiers, attemptId, owner, userId, itemId, now, 'file');
    return media;
  }

  /** Заменяет предыдущий файл к тому же вопросу (ADR-0086/ADR-0137, см.
   * шапку файла) — байты старого убираются журналом сирот, документы обоих
   * коллекций удаляются. */
  private async replacePreviousFile(
    attemptId: string,
    itemId: string,
    now: DateTime,
  ): Promise<void> {
    const previous = await this.mediaModel
      .find({ attemptId, itemId, kind: 'file' })
      .lean<{ answerVideoId?: { toString(): string } }[]>();
    for (const prev of previous) {
      if (!prev.answerVideoId) continue;
      const prevVideo = await this.model
        .findById(prev.answerVideoId.toString())
        .lean<RawLeanAnswerVideo | null>();
      if (!prevVideo) continue;
      await this.orphans.removeNow(prevVideo.key, now);
      await this.model.deleteOne({ _id: prevVideo._id });
    }
    await this.mediaModel.deleteMany({ attemptId, itemId, kind: 'file' });
  }
}
