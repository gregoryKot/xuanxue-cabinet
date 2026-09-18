// GET /lessons/recording-summary (docs/PLAN.md §14 слой 3.5, CLAUDE.md
// «Продуктовая фича = число в своём разделе», ADR-0025) — за
// RECORDING_SUMMARY_PERIOD_DAYS дней сколько занятий прошло и у скольких из
// них есть запись. Отдельный сервис, не метод LessonsService (151 строка,
// CLAUDE.md «Храповики» — check-file-size-ratchet.mjs считает каждый файл).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  RECORDING_SUMMARY_PERIOD_DAYS,
  type LessonRecordingSummaryDto,
} from '@xuanxue/shared';
import { LessonRecord } from './lesson.schema';
import {
  countLessonsPast,
  countLessonsWithRecording,
} from './lesson-recording-summary.queries';

@Injectable()
export class LessonRecordingSummaryService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
  ) {}

  async get(now: DateTime): Promise<LessonRecordingSummaryDto> {
    const from = now.minus({ days: RECORDING_SUMMARY_PERIOD_DAYS }).toJSDate();
    const to = now.toJSDate();
    const [lessonsPast, lessonsWithRecording] = await Promise.all([
      countLessonsPast(this.model, from, to),
      countLessonsWithRecording(this.model, from, to),
    ]);
    return {
      periodDays: RECORDING_SUMMARY_PERIOD_DAYS,
      lessonsPast,
      lessonsWithRecording,
    };
  }
}
