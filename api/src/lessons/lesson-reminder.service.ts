// «Занятие скоро» — шаг тика планировщика (ADR-0135, ADR-0162): регрессия на
// баг-репорт 2026-09-27 «ученик включил push на iPhone, напоминаний о
// занятиях не приходило» — вида не было вовсе (ADR-0069).
//
// «За сколько минут» у каждого своё (ADR-0162, п. 3): человек выбирает из
// 15/30/60/120, иначе берётся школьное `settings.lessonReminderMinutes`. Поэтому
// «напомнили» — свойство пары «человек × занятие», а не занятия: отметку
// `studentReminderSentAt` заменила сама строка ленты, уникальный индекс
// (userId, kind, lessonId) — и защита от дубля при втором тике или втором
// инстансе (`insertNotificationRowOnce`: push уходит только тому, чей вызов
// строку вставил). Кандидаты — занятия `scheduled` в окне самого раннего из
// людей; кому и когда пора, решает чистая `planReminders`.
//
// Получатели — активные ученики (listActiveStudents, люди без единой роли,
// ADR-0026) с включённым видом lesson_soon (NotificationPrefsService.
// getManyEnabled), о занятиях по их выбору (LessonScopeService, ADR-0162).
// Модель пользователя — напрямую (UserModelModule), не через UsersService
// (CLAUDE.md «Храповики»). Доставка — лента кабинета и push
// (PushSenderService.sendToUser — никогда не бросает, ADR-0092).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { errorMessage, errorStack } from '../common/error-info';
import { ClassRecord } from '../classes/class.schema';
import { LessonScopeService } from '../notifications/lesson-scope.service';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { insertNotificationRowOnce } from '../notifications/notification-row-once';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { SettingsService } from '../settings/settings.service';
import { listActiveStudents } from '../users/list-active-students';
import { UserRecord } from '../users/user.schema';
import { LessonRecord } from './lesson.schema';
import {
  existingReminderKeys,
  findUpcomingLessons,
  LESSON_SOON_KIND,
} from './lesson-reminder-queries';
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
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    private readonly notificationPrefsService: NotificationPrefsService,
    private readonly lessonScopeService: LessonScopeService,
    private readonly settingsService: SettingsService,
    private readonly pushSender: PushSenderService,
  ) {}

  async remind(now: DateTime): Promise<LessonReminderResult> {
    const recipients = await this.findRecipients();
    if (recipients.length === 0) return { reminded: 0 };
    // Одна выборка на тик, не по ученику в цикле (ADR-0162).
    const prefs = await this.lessonScopeService.getManyLessonPrefs(
      recipients.map((r) => r.id),
    );
    const { lessonReminderMinutes: schoolMinutes } = await this.settingsService.get();

    const lessons = await findUpcomingLessons(
      this.lessonModel,
      this.classModel,
      now,
      maxLeadMinutes(recipients, prefs, schoolMinutes),
    );
    if (lessons.length === 0) return { reminded: 0 };
    const existing = await existingReminderKeys(
      this.notificationModel,
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

  private async findRecipients(): Promise<{ id: string }[]> {
    const students = await listActiveStudents(this.userModel);
    // Ученики без единой роли не дают ключа для defaultNotifications по
    // ролям — getManyEnabled принимает `roles: []` для каждого, тем же
    // приёмом, что defaultNotifications([]) отдаёт STUDENT_NOTIFICATIONS.
    const enabledByUser = await this.notificationPrefsService.getManyEnabled(
      students.map((s) => ({ id: s.id, roles: [] })),
    );
    return students.filter((s) => enabledByUser.get(s.id)?.includes(LESSON_SOON_KIND));
  }

  /** Один человек, одно занятие. Сбой на нём не останавливает остальных: тихий
   * отказ рассылки — самая дорогая ошибка (CLAUDE.md «Логи»), поэтому `error`
   * со стеком, а цикл идёт дальше. Строки нет — следующий тик попробует снова. */
  private async remindOne(
    { userId, lessonId, lessonTitle }: PlannedReminder,
    now: DateTime,
  ): Promise<boolean> {
    try {
      const inserted = await insertNotificationRowOnce(this.notificationModel, {
        userId,
        kind: LESSON_SOON_KIND,
        lessonId,
        lessonTitle,
      });
      if (!inserted) return false;
      await this.pushSender.sendToUser(userId, now);
      return true;
    } catch (error) {
      this.logger.error(
        `Напоминание о занятии ${lessonId} для ${userId} не записано: ${errorMessage(error)}`,
        errorStack(error),
      );
      return false;
    }
  }
}
