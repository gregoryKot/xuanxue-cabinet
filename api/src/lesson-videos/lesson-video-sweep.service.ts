// Уборщик видео записей занятий (ADR-0180) — по той же причине, что
// ExamVideoSweepService: видео живёт, пока на него ссылается запись занятия
// (`lessons.recordings.videoId`). Сиротой считается только готовое видео старше
// суток: загрузка, которая идёт частями, ссылки ещё ждёт, а в первые сутки учитель
// успевает привязать готовый файл к записи. Брошенную загрузку (неделя без движения)
// убирает общее ядро video-uploads/ (ADR-0165) тем же шагом. Шаг планировщика, не
// HTTP. Без ключей R2 (хранилище выключено) шаг молча ничего не делает: сиротам
// взяться неоткуда. Срок хранения по дням (настройка школы) — отдельный слой PLAN §18.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import { LessonRecord } from '../lessons/lesson.schema';
import { FileStoreService } from '../storage/file-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { removeUnreferencedVideos } from '../video-uploads/video-orphans-remove';
import { STALE_UPLOAD_DAYS } from '../video-uploads/video-upload-stale';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { LESSON_VIDEO_READY_FILTER } from './lesson-video.mapper';
import { LessonVideoRecord } from './lesson-video.schema';

const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт остаток.
const LESSON_VIDEO_SWEEP_BATCH_LIMIT = 50;

export interface LessonVideoSweepResult {
  removed: number;
}

@Injectable()
export class LessonVideoSweepService {
  constructor(
    @InjectModel(LessonVideoRecord.name) private readonly model: Model<LessonVideoRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    private readonly fileStore: FileStoreService,
    private readonly orphans: StorageOrphansService,
    private readonly uploads: VideoUploadsService,
  ) {}

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeOrphans(now: DateTime): Promise<LessonVideoSweepResult> {
    if (!this.fileStore.isEnabled) return { removed: 0 };
    const stale = await this.uploads.sweepStale(this.model, {
      olderThanDays: STALE_UPLOAD_DAYS,
      limit: LESSON_VIDEO_SWEEP_BATCH_LIMIT,
      now,
    });
    const unreferenced = await this.removeUnreferenced(now);
    return { removed: stale + unreferenced };
  }

  /** Id видео, на которые ссылается запись занятия. Без `within` — весь набор
   * (для школы это сотни id): используемые исключаются прямо в запросе кандидатов
   * (`$nin`), а не после выборки, иначе батч из одних используемых не оставлял бы
   * сироте места никогда (тот же довод, что у referencedMediaIds, F54). С `within` —
   * повторная сверка уже выбранных кандидатов: страховка от гонки «запись добавлена
   * между выборкой и удалением». Ссылка хранится строкой, а `_id` видео — ObjectId. */
  private async referencedIds(within?: Types.ObjectId[]): Promise<Types.ObjectId[]> {
    const filter = within
      ? { 'recordings.videoId': { $in: within.map((id) => id.toString()) } }
      : { 'recordings.videoId': { $exists: true } };
    const ids: unknown[] = await this.lessonModel.distinct('recordings.videoId', filter);
    return ids
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private async removeUnreferenced(now: DateTime): Promise<number> {
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    const used = await this.referencedIds();
    const candidates = await this.model
      .find(
        {
          ...LESSON_VIDEO_READY_FILTER,
          createdAt: { $lt: boundary },
          _id: { $nin: used },
        },
        { _id: 1, key: 1 },
      )
      .sort({ createdAt: 1 })
      .limit(LESSON_VIDEO_SWEEP_BATCH_LIMIT)
      .lean();
    if (candidates.length === 0) return 0;

    const referenced = new Set(
      (await this.referencedIds(candidates.map((doc) => doc._id))).map((id) =>
        id.toString(),
      ),
    );
    return removeUnreferencedVideos(
      { model: this.model, orphans: this.orphans },
      candidates,
      referenced,
      now,
    );
  }
}
