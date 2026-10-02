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
import type { Model, Types } from 'mongoose';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { referencedMediaIds } from '../exams/exam-media-references';
import { ExamImageRecord } from './exam-image.schema';

// Учитель загрузил картинку и не сохранил вопрос — сутки на «передумал»,
// прежде чем считать её сиротой (ADR-0035).
const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт
// остаток, тот же приём, что у DEADLINE_BATCH_LIMIT соседнего шага
// (exam-deadline-close.service.ts).
export const SWEEP_BATCH_LIMIT = 50;

export interface ExamImageSweepResult {
  removed: number;
}

/** Запрос кандидатов на уборку — отдельной функцией, чтобы спек плана
 * (database/scheduler-query-indexes.spec.ts) гонял ровно его, а не копию.
 * Проекция `{ _id: 1 }` вместе с индексом `{ createdAt, _id }`
 * (exam-image.schema.ts) делает запрос покрытым: байты картинок не читаются,
 * пока все старые картинки используются (аудит 2026-10-01, F54, ревью PR #525). */
export function orphanImageCandidatesQuery(
  model: Model<ExamImageRecord>,
  boundary: Date,
  used: Types.ObjectId[],
) {
  return model
    .find({ createdAt: { $lt: boundary }, _id: { $nin: used } }, { _id: 1 })
    .sort({ createdAt: 1 })
    .limit(SWEEP_BATCH_LIMIT);
}

@Injectable()
export class ExamImageSweepService {
  constructor(
    @InjectModel(ExamImageRecord.name) private readonly model: Model<ExamImageRecord>,
    // Публичные ради `referencedMediaIds(this, …)` — сервис сам и есть ExamMediaOwners.
    @InjectModel(ExamItemRecord.name) readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamAttemptRecord.name) readonly attemptModel: Model<ExamAttemptRecord>,
  ) {}

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeOrphans(now: DateTime): Promise<ExamImageSweepResult> {
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    // Используемые id исключаются в самом запросе ($nin), не после выборки —
    // почему, см. referencedMediaIds (аудит 2026-10-01, F54). Явный sort —
    // чтобы порядок не зависел от плана запроса.
    const used = await referencedMediaIds(this, 'imageIds');
    const candidates = await orphanImageCandidatesQuery(
      this.model,
      boundary,
      used,
    ).lean();
    if (candidates.length === 0) return { removed: 0 };
    const ids = candidates.map((doc) => doc._id);

    const referenced = new Set(
      (await referencedMediaIds(this, 'imageIds', ids)).map((id) => id.toString()),
    );
    const orphans = ids.filter((id) => !referenced.has(id.toString()));
    if (orphans.length === 0) return { removed: 0 };

    const { deletedCount } = await this.model.deleteMany({ _id: { $in: orphans } });
    return { removed: deletedCount };
  }
}
