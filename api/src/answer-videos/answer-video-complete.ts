// POST /answer-videos/:id/complete (ADR-0137) — завершить multipart-загрузку
// в R2 и превратить видео-ответ в `media_assets` (`kind: 'file'`). Вынесено
// из AnswerVideosService (файл-лимит CLAUDE.md «Храповики»).
//
// Повтор доводит загрузку до конца (ADR-0165, F47 аудита 2026-10-01): сборка в
// R2 — общее ядро video-uploads/, запись и замена файла — answer-video-attach.ts,
// переход в `ready` условный, поэтому уведомление уходит один раз. Готовое
// видео на повторе отдаёт ту же запись: ответ на первый вызов мог потеряться
// по дороге, и 409 на уже сохранённом файле выглядел бы для ученика сбоем.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  ANSWER_VIDEO_NOT_FOUND_MESSAGE,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { assertObjectId } from '../common/object-id';
import { ConflictError, NotFoundError } from '../common/errors';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { MediaAssetRecord } from '../media/media-asset.schema';
import { loadAttemptOwnerInfo } from '../media/media-attempt-owner';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import { notifyVideoAdded } from '../media/notify-video-link-added';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { assertAllPartsReceived } from '../video-uploads/video-upload-assemble';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { attachFileMedia, findFileMedia } from './answer-video-attach';
import { AnswerVideoRecord, type RawLeanAnswerVideo } from './answer-video.schema';

@Injectable()
export class AnswerVideoCompleteService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(MediaAssetRecord.name)
    private readonly mediaModel: Model<MediaAssetRecord>,
    private readonly uploads: VideoUploadsService,
    private readonly orphans: StorageOrphansService,
    private readonly notifiers: ExamMediaNotifierRegistry,
  ) {}

  async complete(id: string, userId: string, now: DateTime): Promise<ExamMediaDto> {
    assertObjectId(id, ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanAnswerVideo | null>();
    if (!doc || doc.userId.toString() !== userId) {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    if (doc.status === 'ready') return this.completedEarlier(doc);
    if (!doc.uploadId) throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    assertAllPartsReceived(doc);

    const attemptId = doc.attemptId.toString();
    const itemId = doc.itemId.toString();
    const owner = await loadAttemptOwnerInfo(this.attemptModel, attemptId);
    if (!owner || owner.userId !== userId) {
      throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    }
    if (owner.status === 'graded') {
      throw new ConflictError(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE);
    }

    await this.uploads.assemble(this.model, doc, doc.uploadId, now);
    const media = await attachFileMedia(
      { model: this.model, mediaModel: this.mediaModel, orphans: this.orphans },
      doc,
      now,
    );

    // Условный переход: из двух параллельных `complete` его делает один, он
    // же и уведомляет — уведомление не должно уйти дважды.
    const moved = await this.model.updateOne(
      { _id: doc._id, status: 'uploading' },
      {
        $set: { status: 'ready', completedAt: now.toJSDate(), parts: [] },
        $unset: { uploadId: 1, r2CompletedAt: 1 },
      },
    );
    if (moved.modifiedCount > 0) {
      notifyVideoAdded(this.notifiers, attemptId, owner, userId, itemId, now, 'file');
    }
    return media;
  }

  /** Видео уже `ready` — отдаём его запись. Записи нет (убрана уборщиком между
   * вызовами) — то же 409, что и раньше: отдавать нечего. */
  private async completedEarlier(doc: RawLeanAnswerVideo): Promise<ExamMediaDto> {
    const media = await findFileMedia(this.mediaModel, doc._id);
    if (!media) throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    return media;
  }
}
