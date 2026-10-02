// Число видео-ответов и их суммарный объём — число раздела «Экзамены»
// (CLAUDE.md «Продуктовая фича = число в своём разделе»), тем же приёмом,
// что ExamVideoStatsService. Только `status: 'ready'` — недогруженное видео
// никто ещё не смотрел, в объём школы его считать рано.
//
// `pendingItemIds` — второй, точечный вопрос к той же коллекции: у каких
// вопросов попытки видео ещё грузится (аудит 2026-10-01 F34). Здесь, а не
// в exams/: ExamsModule импортирует AnswerVideosModule, обратно — цикл.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, PipelineStage, Types } from 'mongoose';
import type { AnswerVideoStatsDto } from '@xuanxue/shared';
import { AnswerVideoRecord } from './answer-video.schema';

/** Сколько загрузка может молчать и всё ещё считаться живой. Часть в 8 МиБ
 * приходит чаще раза в минуту, но телефон в фоне (ученик ушёл в Telegram)
 * замораживает вкладку на минуты и потом продолжает с той же части — за час
 * такая пауза укладывается, а брошенная загрузка (sweep через 7 дней) не
 * держит учителя «видео загружается» неделю (F34). */
export const ANSWER_VIDEO_UPLOAD_LIVENESS_MIN = 60;

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

  /** `itemId` вопросов попытки, чьё видео ещё грузится: `uploading` и
   * `updatedAt` не старше ANSWER_VIDEO_UPLOAD_LIVENESS_MIN (каждая принятая
   * часть обновляет `updatedAt`, answer-video-part.ts). Индекс
   * `{ attemptId, itemId, status }` уже есть (answer-video.schema.ts). */
  async pendingItemIds(attemptId: string, now: DateTime): Promise<string[]> {
    const since = now.minus({ minutes: ANSWER_VIDEO_UPLOAD_LIVENESS_MIN }).toJSDate();
    const docs = await this.model
      .find({ attemptId, status: 'uploading', updatedAt: { $gte: since } })
      .select('itemId')
      .lean<{ itemId: Types.ObjectId }[]>();
    return [...new Set(docs.map((doc) => doc.itemId.toString()))];
  }
}
