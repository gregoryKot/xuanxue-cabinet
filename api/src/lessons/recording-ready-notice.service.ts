// «Запись занятия» — шаг тика планировщика (ADR-0162, п. 4). Учитель добавляет
// запись (`POST /lessons/:id/recordings` или видео боту), и запрос на этом
// заканчивается; момент первой записи лежит на занятии (`recordingReadyAt`,
// LessonsService.addRecording), а сообщает о нём шаг — ход один с «Занятием
// отменено» (LessonNoticeStep). Отличие одно: вид выключен у всех, пока ученик
// сам его не включил (`STUDENT_OPTIONAL_NOTIFICATIONS`, ADR-0162), поэтому
// получателей обычно единицы, а не вся школа.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { PlanLesson } from './lesson-notice-queries';
import { LessonNoticeStep } from './lesson-notice-step';
import {
  findRecentlyRecordedLessons,
  RECORDING_READY_KIND,
} from './recording-ready-notice-queries';

@Injectable()
export class RecordingReadyNoticeService extends LessonNoticeStep {
  protected readonly kind = RECORDING_READY_KIND;
  protected readonly what = 'о записи занятия';

  protected findLessons(now: DateTime): Promise<PlanLesson[]> {
    return findRecentlyRecordedLessons(this.lessonModel, this.classModel, now);
  }
}
