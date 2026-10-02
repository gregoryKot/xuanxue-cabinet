// Уборщик видео-ответа (ADR-0137) — шаг планировщика, три случая: (а)
// брошенная загрузка (`status: 'uploading'`, недели без части — R2 и так
// держит брошенные части не дольше); (б) готовый файл, на который уже никто
// не ссылается (`media_assets.answerVideoId`) — гонка повторного старта
// попытки (ADR-0131) или самой этой уборки; (в) файл по сроку хранения
// (ANSWER_VIDEO_RETENTION — 90 дней после проверки, год без неё). Без ключей
// R2 шаг ничего не делает — MultipartStoreService.isEnabled тот же признак,
// что у FileStoreService (r2.config.ts).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ANSWER_VIDEO_RETENTION } from '@xuanxue/shared';
import { ExamGradingRecord } from '../exams/exam-grading.schema';
import { MediaAssetRecord } from '../media/media-asset.schema';
import { MultipartStoreService } from '../storage/multipart-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { AnswerVideoRecord, type RawLeanAnswerVideo } from './answer-video.schema';

// Брошенная загрузка живёт неделю (ADR-0137) — столько же R2 сам держит
// брошенные части, продлевать смысла нет.
const STALE_UPLOAD_DAYS = 7;
// Не «дай всё» (CLAUDE.md «API») — следующий тик доберёт остаток, тот же
// приём, что у SWEEP_BATCH_LIMIT соседних шагов (exam-video-sweep.service.ts).
const SWEEP_BATCH_LIMIT = 50;

export interface AnswerVideoSweepResult {
  removed: number;
}

@Injectable()
export class AnswerVideoSweepService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    @InjectModel(MediaAssetRecord.name)
    private readonly mediaModel: Model<MediaAssetRecord>,
    @InjectModel(ExamGradingRecord.name)
    private readonly gradingModel: Model<ExamGradingRecord>,
    private readonly multipart: MultipartStoreService,
    private readonly orphans: StorageOrphansService,
    private readonly uploads: VideoUploadsService,
  ) {}

  async removeExpired(now: DateTime): Promise<AnswerVideoSweepResult> {
    if (!this.multipart.isEnabled) return { removed: 0 };
    const stale = await this.sweepStaleUploads(now);
    const unlinked = await this.sweepUnlinkedReady(now);
    const expired = await this.sweepExpiredReady(now);
    return { removed: stale + unlinked + expired };
  }

  // Брошенные загрузки — общее ядро (ADR-0165); сроки хранения готовых
  // файлов ниже — только про видео-ответ.
  private sweepStaleUploads(now: DateTime): Promise<number> {
    return this.uploads.sweepStale(this.model, {
      olderThanDays: STALE_UPLOAD_DAYS,
      limit: SWEEP_BATCH_LIMIT,
      now,
    });
  }

  private async sweepUnlinkedReady(now: DateTime): Promise<number> {
    const candidates = await this.model
      .find(
        { status: 'ready', completedAt: { $lt: now.minus({ days: 1 }).toJSDate() } },
        { _id: 1, key: 1 },
      )
      .limit(SWEEP_BATCH_LIMIT)
      .lean<Pick<RawLeanAnswerVideo, '_id' | 'key'>[]>();
    let removed = 0;
    for (const doc of candidates) {
      const referenced = await this.mediaModel.exists({ answerVideoId: doc._id });
      if (referenced) continue;
      await this.removeReady(doc._id.toString(), doc.key, now);
      removed += 1;
    }
    return removed;
  }

  private async sweepExpiredReady(now: DateTime): Promise<number> {
    const ungradedBoundary = now
      .minus({ days: ANSWER_VIDEO_RETENTION.ungradedDays })
      .toJSDate();
    const byAge = await this.model
      .find(
        { status: 'ready', completedAt: { $lt: ungradedBoundary } },
        { _id: 1, key: 1 },
      )
      .limit(SWEEP_BATCH_LIMIT)
      .lean<Pick<RawLeanAnswerVideo, '_id' | 'key'>[]>();

    const gradedBoundary = now
      .minus({ days: ANSWER_VIDEO_RETENTION.afterGradedDays })
      .toJSDate();
    const gradedAttemptIds = await this.gradingModel.distinct('attemptId', {
      gradedAt: { $lt: gradedBoundary },
    });
    const byGrading = gradedAttemptIds.length
      ? await this.model
          .find(
            { status: 'ready', attemptId: { $in: gradedAttemptIds } },
            { _id: 1, key: 1 },
          )
          .limit(SWEEP_BATCH_LIMIT)
          .lean<Pick<RawLeanAnswerVideo, '_id' | 'key'>[]>()
      : [];

    const merged = new Map(
      [...byAge, ...byGrading].map((doc) => [doc._id.toString(), doc] as const),
    );
    for (const doc of merged.values()) {
      await this.removeReady(doc._id.toString(), doc.key, now);
      // media_assets держит факт получения — снимается ссылка на байты, не запись.
      await this.mediaModel.updateMany(
        { answerVideoId: doc._id },
        { $unset: { answerVideoId: 1 } },
      );
    }
    return merged.size;
  }

  private async removeReady(id: string, key: string, now: DateTime): Promise<void> {
    await this.orphans.removeNow(key, now);
    await this.model.deleteOne({ _id: id });
  }
}
