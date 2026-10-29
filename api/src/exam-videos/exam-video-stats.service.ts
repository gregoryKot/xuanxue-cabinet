// Число видео вопросов/вариантов и их суммарный объём — число раздела
// «Экзамены» (CLAUDE.md «Продуктовая фича = число в своём разделе»), тем же
// приёмом, что ExamImageStatsService: пустая коллекция — честный ноль.
// Считаются только готовые: недогруженное (ADR-0165) никто ещё не смотрел.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import { H264_VIDEO_CODEC, type ExamVideoStatsDto } from '@xuanxue/shared';
import { EXAM_VIDEO_READY_FILTER } from './exam-video.mapper';
import { ExamVideoRecord } from './exam-video.schema';

interface ExamVideoStatsAggregation {
  count: number;
  totalBytes: number;
  withoutPosterCount: number;
  codecPendingCount: number;
}

// `$type` отсутствующего поля — 'missing' (а не null): так считаются старые видео
// без кадра, ради которых раздел показывает кнопку «Снять кадры» (ADR-0182).
const WITHOUT_POSTER = {
  $sum: { $cond: [{ $eq: [{ $type: '$poster' }, 'missing'] }, 1, 0] },
};

// Не `avc` — это и кодек HEVC и т. п., и поле, которого нет (загружено до ADR-0189):
// в `$ne` отсутствующее поле даёт «не равно». Те же видео отдаёт список кнопки
// «Перегнать видео» (findVideosCodecPending, video-uploads/video-codec.ts).
const CODEC_PENDING = {
  $sum: { $cond: [{ $ne: ['$videoCodec', H264_VIDEO_CODEC] }, 1, 0] },
};

@Injectable()
export class ExamVideoStatsService {
  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
  ) {}

  async getSummary(): Promise<ExamVideoStatsDto> {
    const pipeline: PipelineStage[] = [
      { $match: EXAM_VIDEO_READY_FILTER },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalBytes: { $sum: '$sizeBytes' },
          withoutPosterCount: WITHOUT_POSTER,
          codecPendingCount: CODEC_PENDING,
        },
      },
    ];
    const results = await this.model.aggregate<ExamVideoStatsAggregation>(pipeline);
    const totals = results[0];
    return totals
      ? {
          count: totals.count,
          totalBytes: totals.totalBytes,
          withoutPosterCount: totals.withoutPosterCount,
          codecPendingCount: totals.codecPendingCount,
        }
      : { count: 0, totalBytes: 0, withoutPosterCount: 0, codecPendingCount: 0 };
  }
}
