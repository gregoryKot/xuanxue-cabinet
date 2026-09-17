// Число картинок вариантов ответа и их суммарный объём — число раздела
// «Экзамены» (CLAUDE.md «Продуктовая фича = число в своём разделе», ADR-0035
// «Последствия»: база растёт с каждой картинкой, админ должен видеть объём).
// `sizeBytes` — размер исходного файла (schema-комментарий exam-image.
// schema.ts), не шифротекста: число должно отражать настоящий вес файла, не
// накладные расходы AES-GCM.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import type { ExamImageStatsDto } from '@xuanxue/shared';
import { ExamImageRecord } from './exam-image.schema';

interface ExamImageStatsAggregation {
  count: number;
  totalBytes: number;
}

@Injectable()
export class ExamImageStatsService {
  constructor(
    @InjectModel(ExamImageRecord.name) private readonly model: Model<ExamImageRecord>,
  ) {}

  /** Пустая коллекция — честный ноль (CLAUDE.md «Продуктовая фича = число в
   * своём разделе»): `$group` не создаёт ни одной строки, если совпадений
   * нет, поэтому пустой результат — отдельная ветка, не деление на ноль. */
  async getSummary(): Promise<ExamImageStatsDto> {
    const pipeline: PipelineStage[] = [
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } },
    ];
    const results = await this.model.aggregate<ExamImageStatsAggregation>(pipeline);
    const totals = results[0];
    return totals
      ? { count: totals.count, totalBytes: totals.totalBytes }
      : { count: 0, totalBytes: 0 };
  }
}
