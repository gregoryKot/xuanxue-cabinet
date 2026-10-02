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
import { parseVideoPoster, setPosterIfAbsent } from '../video-uploads/video-poster';
import { markVideoReady } from '../video-uploads/video-upload-ready';
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

  async complete(
    id: string,
    userId: string,
    now: DateTime,
    posterBase64?: string,
  ): Promise<ExamMediaDto> {
    assertObjectId(id, ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanAnswerVideo | null>();
    if (!doc || doc.userId.toString() !== userId) {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    // Неверный кадр — 400 до сборки в R2: видео остаётся незавершённым, и его
    // завершает повтор без кадра (ADR-0165).
    const poster = parseVideoPoster(posterBase64);
    if (doc.status === 'ready') return this.completedEarlier(doc, poster);
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

    // Из двух параллельных `complete` переход делает один, он же и уведомляет —
    // уведомление не должно уйти дважды.
    if (await markVideoReady(this.model, doc._id, { now, poster })) {
      notifyVideoAdded(this.notifiers, attemptId, owner, userId, itemId, now, 'file');
    }
    return media;
  }

  /** Видео уже `ready` — отдаём его запись. Записи нет (убрана уборщиком между
   * вызовами) — то же 409, что и раньше: отдавать нечего. */
  private async completedEarlier(
    doc: RawLeanAnswerVideo,
    poster: Buffer | undefined,
  ): Promise<ExamMediaDto> {
    const media = await findFileMedia(this.mediaModel, doc._id);
    if (!media) throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    // Повтор с кадром, которого у готового видео ещё нет (первый вызов шёл без
    // него) — ставим; уже стоящий не перетирается.
    await setPosterIfAbsent(this.model, doc._id.toString(), poster);
    return media;
  }
}
