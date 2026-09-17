// Уборщик картинок-сирот (ADR-0035, «Последствия»; PLAN §11, таблица
// «Данные»): картинка живёт, пока на неё ссылается вопрос банка (текущие
// варианты или история правок — `exam_items.imageIds`) или снимок попытки
// (`exam_attempts.imageIds`); оба поля — плоские индексируемые копии именно
// ради этого запроса, сами options/history/blocks зашифрованы целиком, и
// Mongo внутрь них не видит. Шаг планировщика (scheduler.service.ts), не
// HTTP — учитель ничего не нажимает, картинки убираются сами.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { ExamImageRecord } from './exam-image.schema';

// Учитель загрузил картинку и не сохранил вопрос — сутки на «передумал»,
// прежде чем считать её сиротой (ADR-0035).
const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт
// остаток, тот же приём, что у DEADLINE_BATCH_LIMIT соседнего шага
// (exam-deadline-close.service.ts).
const SWEEP_BATCH_LIMIT = 50;

export interface ExamImageSweepResult {
  removed: number;
}

@Injectable()
export class ExamImageSweepService {
  constructor(
    @InjectModel(ExamImageRecord.name) private readonly model: Model<ExamImageRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
  ) {}

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeOrphans(now: DateTime): Promise<ExamImageSweepResult> {
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    const candidates = await this.model
      .find({ createdAt: { $lt: boundary } }, { _id: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean();
    if (candidates.length === 0) return { removed: 0 };
    const ids = candidates.map((doc) => doc._id);

    const [usedInItems, usedInAttempts] = await Promise.all([
      this.itemModel.distinct('imageIds', { imageIds: { $in: ids } }),
      this.attemptModel.distinct('imageIds', { imageIds: { $in: ids } }),
    ]);
    const referenced = new Set(
      [...usedInItems, ...usedInAttempts].map((id) => id.toString()),
    );
    const orphans = ids.filter((id) => !referenced.has(id.toString()));
    if (orphans.length === 0) return { removed: 0 };

    const { deletedCount } = await this.model.deleteMany({ _id: { $in: orphans } });
    return { removed: deletedCount };
  }
}
