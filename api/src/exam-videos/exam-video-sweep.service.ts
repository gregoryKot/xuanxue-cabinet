// Уборщик видео вопросов (ADR-0133) — тем же приёмом и по той же причине, что
// ExamImageSweepService: видео живёт, пока на него ссылается вопрос банка
// (текущие поля/варианты или история правок — `exam_items.videoIds`) или
// снимок попытки (`exam_attempts.videoIds`). Сиротой считается только готовое
// видео: загрузку, которая идёт частями, ссылки ещё ждут; брошенную (неделя без
// движения) убирает общее ядро video-uploads/ (ADR-0165) тем же шагом. Шаг планировщика
// (scheduler.service.ts), не HTTP. Без ключей R2 (хранилище выключено) шаг
// молча ничего не делает — учитель тогда грузит видео только ссылкой,
// сиротам взяться неоткуда.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { referencedMediaIds } from '../exams/exam-media-references';
import { FileStoreService } from '../storage/file-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { removeUnreferencedVideos } from '../video-uploads/video-orphans-remove';
import { STALE_UPLOAD_DAYS } from '../video-uploads/video-upload-stale';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { EXAM_VIDEO_READY_FILTER } from './exam-video.mapper';
import { ExamVideoRecord } from './exam-video.schema';

const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт
// остаток, тот же приём, что у SWEEP_BATCH_LIMIT соседнего шага
// (exam-image-sweep.service.ts).
export const SWEEP_BATCH_LIMIT = 50;

export interface ExamVideoSweepResult {
  removed: number;
}

@Injectable()
export class ExamVideoSweepService {
  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
    // Публичные ради `referencedMediaIds(this, …)` — сервис сам и есть ExamMediaOwners.
    @InjectModel(ExamItemRecord.name) readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamAttemptRecord.name) readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly fileStore: FileStoreService,
    private readonly orphans: StorageOrphansService,
    private readonly uploads: VideoUploadsService,
  ) {}

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeOrphans(now: DateTime): Promise<ExamVideoSweepResult> {
    if (!this.fileStore.isEnabled) return { removed: 0 };
    const stale = await this.uploads.sweepStale(this.model, {
      olderThanDays: STALE_UPLOAD_DAYS,
      limit: SWEEP_BATCH_LIMIT,
      now,
    });
    const unreferenced = await this.removeUnreferenced(now);
    return { removed: stale + unreferenced };
  }

  private async removeUnreferenced(now: DateTime): Promise<number> {
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    // Используемые id исключаются в самом запросе ($nin) — почему, см.
    // referencedMediaIds (аудит 2026-10-01, F54).
    const used = await referencedMediaIds(this, 'videoIds');
    const candidates = await this.model
      .find(
        { ...EXAM_VIDEO_READY_FILTER, createdAt: { $lt: boundary }, _id: { $nin: used } },
        { _id: 1, key: 1 },
      )
      .sort({ createdAt: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean();
    if (candidates.length === 0) return 0;
    const ids = candidates.map((doc) => doc._id);

    const referenced = new Set(
      (await referencedMediaIds(this, 'videoIds', ids)).map((id) => id.toString()),
    );
    return removeUnreferencedVideos(
      { model: this.model, orphans: this.orphans },
      candidates,
      referenced,
      now,
    );
  }
}
