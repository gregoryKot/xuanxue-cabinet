// «Занятие отменено» — шаг тика планировщика (ADR-0162, п. 4). Учитель
// отменяет занятие PATCH-ом (`status: 'cancelled'`), и запрос на этом
// заканчивается: ни push, ни запись ленты ученикам в него не входят. Момент
// отмены лежит на занятии (`cancelledAt`, LessonsService.update), а сообщает о
// ней шаг — ход один с «Записью занятия» (LessonNoticeStep): получатели, «уже
// сообщили» и повтор в окне суток при сбое записи у одного человека.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { PlanLesson } from './lesson-notice-queries';
import { LessonNoticeStep } from './lesson-notice-step';
import {
  findRecentlyCancelledLessons,
  LESSON_CANCELLED_KIND,
} from './lesson-cancel-notice-queries';

@Injectable()
export class LessonCancelNoticeService extends LessonNoticeStep {
  protected readonly kind = LESSON_CANCELLED_KIND;
  protected readonly what = 'об отмене занятия';

  protected findLessons(now: DateTime): Promise<PlanLesson[]> {
    return findRecentlyCancelledLessons(this.lessonModel, this.classModel, now);
  }
}
