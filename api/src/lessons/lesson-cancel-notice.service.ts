// «Занятие отменено» — шаг тика планировщика (ADR-0162, п. 4). Учитель
// отменяет занятие PATCH-ом (`status: 'cancelled'`), и запрос на этом
// заканчивается: ни push, ни запись ленты ученикам в него не входят, чтобы отмена
// не тормозила и не падала из-за чужой доставки. Момент отмены лежит на занятии
// (`cancelledAt`, LessonsService.update), а сообщает о ней этот шаг — и
// повторяет, пока не получится: сбой записи у одного человека догонит
// следующий тик (тихий отказ рассылки — самая дорогая ошибка, CLAUDE.md «Логи»).
//
// Получатели — активные ученики с включённым видом `lesson_cancelled`, о
// занятиях по их выбору (LessonRecipientsService, общий с «Занятием скоро»).
// «Уже сообщили» — строка ленты с уникальным индексом (userId, kind, lessonId),
// push уходит только тому, чей вызов строку вставил (`insertRowAndPush`): два
// тика или два инстанса при деплое не пришлют дубль, а строка `lesson_soon`
// того же занятия отмену не блокирует — вид входит в ключ.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecipientsService } from '../notifications/lesson-recipients.service';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { LessonRecord } from './lesson.schema';
import { insertRowAndPush } from './lesson-notice-delivery';
import { existingLessonRowKeys } from './lesson-notice-queries';
import {
  findRecentlyCancelledLessons,
  LESSON_CANCELLED_KIND,
} from './lesson-cancel-notice-queries';
import { planCancelNotices, type PlannedCancelNotice } from './lesson-cancel-notice-plan';

export interface LessonCancelNoticeResult {
  /** Сколько строк ленты вставлено (а значит, людей, которым ушёл push). */
  notified: number;
}

@Injectable()
export class LessonCancelNoticeService {
  private readonly logger = new Logger(LessonCancelNoticeService.name);

  constructor(
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
    private readonly lessonRecipients: LessonRecipientsService,
    private readonly pushSender: PushSenderService,
  ) {}

  async announce(now: DateTime): Promise<LessonCancelNoticeResult> {
    // Занятия первыми: обычный тик не находит ни одной отмены и на этом
    // заканчивается одним запросом, без поиска получателей.
    const lessons = await findRecentlyCancelledLessons(
      this.lessonModel,
      this.classModel,
      now,
    );
    if (lessons.length === 0) return { notified: 0 };
    const { recipients, prefs } =
      await this.lessonRecipients.findFor(LESSON_CANCELLED_KIND);
    if (recipients.length === 0) return { notified: 0 };
    const existing = await existingLessonRowKeys(
      this.notificationModel,
      LESSON_CANCELLED_KIND,
      recipients.map((r) => r.id),
      lessons.map((l) => l.id),
    );

    const planned = planCancelNotices({ lessons, recipients, prefs, existing });
    const sent = await Promise.all(planned.map((item) => this.notifyOne(item, now)));
    return { notified: sent.filter(Boolean).length };
  }

  /** Один человек, одно занятие: строка ленты и push — `insertRowAndPush`. */
  private notifyOne(
    { userId, lessonId, lessonTitle, lessonStartsAt }: PlannedCancelNotice,
    now: DateTime,
  ): Promise<boolean> {
    return insertRowAndPush(
      { model: this.notificationModel, pushSender: this.pushSender, logger: this.logger },
      { userId, kind: LESSON_CANCELLED_KIND, lessonId, lessonTitle, lessonStartsAt },
      now,
      `Уведомление об отмене занятия ${lessonId} для ${userId}`,
    );
  }
}
