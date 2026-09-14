// Доступ к данным для статистики вопроса банка (ТЗ 4.8, docs/PLAN.md §11).
// Не агрегация Mongo: `blocks`/`answers` в `exam_attempts` хранятся
// зашифрованной JSON-строкой (`encJson`, exam-attempt.schema.ts) — Mongo не
// видит внутри них ни `itemId`, ни `optionIds`, фильтровать или группировать
// таким запросом нельзя. Поэтому один `find` по статусу (индекс
// `status+submittedAt`, exam-attempt.schema.ts) и один проход по
// расшифрованным попыткам в памяти (accumulateAttemptStats,
// exam-item-stats.ts) — без похода в базу за каждой попыткой (CLAUDE.md
// «API»: без N+1). Школа на полсотни-сотню учеников — весь список сданных
// попыток свободно умещается в памяти одного запроса.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  ExamAttemptStatus,
  ExamItemKind,
  ExamItemStatsDto,
  ExamItemStatsSummaryDto,
} from '@xuanxue/shared';
import { decryptAttempt, type RawLeanExamAttempt } from './exam-attempt.mapper';
import { ExamAttemptRecord } from './exam-attempt.schema';
import {
  accumulateAttemptStats,
  computeExamItemStats,
  computeStrugglingCount,
  type ItemStatsAccumulator,
} from './exam-item-stats';
import { decryptExamItem, type RawLeanExamItem } from './exam-item.mapper';
import { ExamItemRecord } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';

// Попытка «в работе» не в счёт (ТЗ 4.8: ученик мог не закончить её или ещё
// передумает менять ответ) — считаются только сданные.
const COUNTED_STATUSES: ExamAttemptStatus[] = ['submitted', 'graded'];
// Только у этих типов вопроса вообще бывает «верно/неверно» (ТЗ 4.2, п.2).
const OPTION_KINDS: ExamItemKind[] = ['single', 'multiple'];

@Injectable()
export class ExamItemStatsService {
  constructor(
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    private readonly examItemsService: ExamItemsService,
  ) {}

  /** Статистика одного вопроса — 404 у несуществующего/битого id тот же, что
   * у остальных ручек банка (ExamItemsService.getById). */
  async getStats(itemId: string): Promise<ExamItemStatsDto> {
    const item = await this.examItemsService.getById(itemId);
    const accByItem = await this.loadAccumulators();
    return computeExamItemStats(item.id, item.kind, item.options, accByItem);
  }

  /** Одно число для карточки-ссылки «Вопросы» на «Экзаменах» (CLAUDE.md
   * «Продуктовая фича = число в своём разделе», выбор метрики —
   * shared/src/exam-item-stats.ts). */
  async getSummary(): Promise<ExamItemStatsSummaryDto> {
    const accByItem = await this.loadAccumulators();
    const docs = await this.itemModel
      .find({ kind: { $in: OPTION_KINDS } })
      .lean<RawLeanExamItem[]>();
    const items = docs.map((doc) => {
      const decrypted = decryptExamItem(doc);
      return { id: decrypted._id.toString(), options: decrypted.options };
    });
    return { strugglingCount: computeStrugglingCount(items, accByItem) };
  }

  private async loadAccumulators(): Promise<Map<string, ItemStatsAccumulator>> {
    const docs = await this.attemptModel
      .find({ status: { $in: COUNTED_STATUSES } })
      .lean<RawLeanExamAttempt[]>();
    const attempts = docs.map((doc) => decryptAttempt(doc));
    return accumulateAttemptStats(attempts);
  }
}
