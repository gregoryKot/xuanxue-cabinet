// Уборщик видео-сирот (ADR-0133) — тем же приёмом и по той же причине, что
// ExamImageSweepService: видео живёт, пока на него ссылается вопрос банка
// (текущие поля/варианты или история правок — `exam_items.videoIds`) или
// снимок попытки (`exam_attempts.videoIds`). Шаг планировщика
// (scheduler.service.ts), не HTTP. Без ключей R2 (хранилище выключено) шаг
// молча ничего не делает — учитель тогда грузит видео только ссылкой,
// сиротам взяться неоткуда.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { FileStoreService } from '../storage/file-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { ExamVideoRecord } from './exam-video.schema';

const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт
// остаток, тот же приём, что у SWEEP_BATCH_LIMIT соседнего шага
// (exam-image-sweep.service.ts).
const SWEEP_BATCH_LIMIT = 50;

export interface ExamVideoSweepResult {
  removed: number;
}

@Injectable()
export class ExamVideoSweepService {
  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly fileStore: FileStoreService,
    private readonly orphans: StorageOrphansService,
  ) {}

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeOrphans(now: DateTime): Promise<ExamVideoSweepResult> {
    if (!this.fileStore.isEnabled) return { removed: 0 };
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    const candidates = await this.model
      .find({ createdAt: { $lt: boundary } }, { _id: 1, key: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean();
    if (candidates.length === 0) return { removed: 0 };
    const ids = candidates.map((doc) => doc._id);

    const [usedInItems, usedInAttempts] = await Promise.all([
      this.itemModel.distinct('videoIds', { videoIds: { $in: ids } }),
      this.attemptModel.distinct('videoIds', { videoIds: { $in: ids } }),
    ]);
    const referenced = new Set(
      [...usedInItems, ...usedInAttempts].map((id) => id.toString()),
    );
    const orphans = candidates.filter((doc) => !referenced.has(doc._id.toString()));
    if (orphans.length === 0) return { removed: 0 };

    // removeNow (ADR-0079) сама кладёт ключ в журнал перед удалением из R2 —
    // отказ хранилища не теряет ключ молча, следующий тик StorageOrphansService.sweep
    // доберёт его сам, даже если запись exam_videos удалена уже сейчас.
    for (const orphan of orphans) {
      await this.orphans.removeNow(orphan.key, now);
    }
    await this.model.deleteMany({ _id: { $in: orphans.map((doc) => doc._id) } });
    return { removed: orphans.length };
  }
}
