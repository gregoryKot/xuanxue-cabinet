// Число видео вопросов/вариантов и их суммарный объём — число раздела
// «Экзамены» (CLAUDE.md «Продуктовая фича = число в своём разделе»), тем же
// приёмом, что ExamImageStatsService: пустая коллекция — честный ноль.
// Считаются только готовые: недогруженное (ADR-0165) никто ещё не смотрел.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import type { ExamVideoStatsDto } from '@xuanxue/shared';
import { EXAM_VIDEO_READY_FILTER } from './exam-video.mapper';
import { ExamVideoRecord } from './exam-video.schema';

interface ExamVideoStatsAggregation {
  count: number;
  totalBytes: number;
}

@Injectable()
export class ExamVideoStatsService {
  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
  ) {}

  async getSummary(): Promise<ExamVideoStatsDto> {
    const pipeline: PipelineStage[] = [
      { $match: EXAM_VIDEO_READY_FILTER },
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } },
    ];
    const results = await this.model.aggregate<ExamVideoStatsAggregation>(pipeline);
    const totals = results[0];
    return totals
      ? { count: totals.count, totalBytes: totals.totalBytes }
      : { count: 0, totalBytes: 0 };
  }
}
