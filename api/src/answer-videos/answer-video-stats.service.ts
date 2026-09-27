// Число видео-ответов и их суммарный объём — число раздела «Экзамены»
// (CLAUDE.md «Продуктовая фича = число в своём разделе»), тем же приёмом,
// что ExamVideoStatsService. Только `status: 'ready'` — недогруженное видео
// никто ещё не смотрел, в объём школы его считать рано.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import type { AnswerVideoStatsDto } from '@xuanxue/shared';
import { AnswerVideoRecord } from './answer-video.schema';

interface AnswerVideoStatsAggregation {
  count: number;
  totalBytes: number;
}

@Injectable()
export class AnswerVideoStatsService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
  ) {}

  async getSummary(): Promise<AnswerVideoStatsDto> {
    const pipeline: PipelineStage[] = [
      { $match: { status: 'ready' } },
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } },
    ];
    const results = await this.model.aggregate<AnswerVideoStatsAggregation>(pipeline);
    const totals = results[0];
    return totals
      ? { count: totals.count, totalBytes: totals.totalBytes }
      : { count: 0, totalBytes: 0 };
  }
}
