// «Занятие скоро» — шаг тика планировщика (ADR-0135, ADR-0162): регрессия на
// баг-репорт 2026-09-27 «ученик включил push на iPhone, напоминаний о
// занятиях не приходило» — вида не было вовсе (ADR-0069).
//
// «За сколько минут» у каждого своё (ADR-0162, п. 3): человек выбирает из
// 15/30/60/120, иначе берётся школьное `settings.lessonReminderMinutes`. Поэтому
// «напомнили» — свойство пары «человек × занятие», а не занятия: отметку
// `studentReminderSentAt` заменила сама строка ленты, уникальный индекс
// (userId, kind, lessonId) — и защита от дубля при втором тике или втором
// инстансе (`insertRowAndPush`: push уходит только тому, чей вызов строку
// вставил). Кандидаты — занятия `scheduled` в окне самого раннего из
// людей; кому и когда пора, решает чистая `planReminders`.
//
// Получатели — активные ученики с включённым видом lesson_soon, о занятиях по
// их выбору (LessonRecipientsService, общий с «Занятием отменено», ADR-0162).
// Доставка — лента кабинета и push (PushSenderService.sendToUser — никогда не
// бросает, ADR-0092).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecipientsService } from '../notifications/lesson-recipients.service';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { SettingsService } from '../settings/settings.service';
import { LessonRecord } from './lesson.schema';
import { insertRowAndPush } from './lesson-notice-delivery';
import { existingLessonRowKeys } from './lesson-notice-queries';
import { findUpcomingLessons, LESSON_SOON_KIND } from './lesson-reminder-queries';
import {
  maxLeadMinutes,
  planReminders,
  type PlannedReminder,
} from './lesson-reminder-plan';

export interface LessonReminderResult {
  /** Сколько строк ленты вставлено (а значит, людей, которым ушёл push). */
  reminded: number;
}

@Injectable()
export class LessonReminderService {
  private readonly logger = new Logger(LessonReminderService.name);

  constructor(
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
    private readonly lessonRecipients: LessonRecipientsService,
    private readonly settingsService: SettingsService,
    private readonly pushSender: PushSenderService,
  ) {}

  async remind(now: DateTime): Promise<LessonReminderResult> {
    const { recipients, prefs } = await this.lessonRecipients.findFor(LESSON_SOON_KIND);
    if (recipients.length === 0) return { reminded: 0 };
    const { lessonReminderMinutes: schoolMinutes } = await this.settingsService.get();

    const lessons = await findUpcomingLessons(
      this.lessonModel,
      this.classModel,
      now,
      maxLeadMinutes(recipients, prefs, schoolMinutes),
    );
    if (lessons.length === 0) return { reminded: 0 };
    const existing = await existingLessonRowKeys(
      this.notificationModel,
      LESSON_SOON_KIND,
      recipients.map((r) => r.id),
      lessons.map((l) => l.id),
    );

    const planned = planReminders({
      lessons,
      recipients,
      prefs,
      existing,
      schoolMinutes,
      now,
    });
    const sent = await Promise.all(planned.map((item) => this.remindOne(item, now)));
    return { reminded: sent.filter(Boolean).length };
  }

  /** Один человек, одно занятие: строка ленты и push — `insertRowAndPush`. */
  private remindOne(
    { userId, lessonId, lessonTitle }: PlannedReminder,
    now: DateTime,
  ): Promise<boolean> {
    return insertRowAndPush(
      { model: this.notificationModel, pushSender: this.pushSender, logger: this.logger },
      { userId, kind: LESSON_SOON_KIND, lessonId, lessonTitle },
      now,
      `Напоминание о занятии ${lessonId} для ${userId}`,
    );
  }
}
