// «Занятие скоро» — шаг тика планировщика (ADR-0135): регрессия на
// баг-репорт 2026-09-27 «ученик включил push на iPhone, напоминаний о
// занятиях не приходило» — вида не было вовсе (ADR-0069). Кандидаты: занятия
// status 'scheduled', без studentReminderSentAt, startsAt в
// (now, now + lessonReminderMinutes] (settings.lessonReminderMinutes,
// ADR-0135) — условный апдейт ДО отправки (claimAndRun), тот же приём, что
// RecordingPromptService рядом.
//
// Получатели — активные ученики (listActiveStudents, люди без единой роли,
// ADR-0026) с включённым видом lesson_soon (NotificationPrefsService.
// getManyEnabled). Модель пользователя — напрямую (UserModelModule), не через
// UsersService: тот же приём, что у lessonModel/classModel ниже, и файл
// UsersService не растёт лишним методом (CLAUDE.md «Храповики»). Групп у
// ученика пока нет (my-lessons.service.ts, шапка файла) — напоминание уходит
// о любом занятии школы всем активным ученикам, не только «своим»: то же
// решение, что уже действует у GET /me/lessons, записано отдельно в
// ADR-0135.
//
// Доставка — лента кабинета (writeNotificationRow, in-app-staff-write.ts —
// та же функция, что у трёх экзаменных уведомлений, не вторая копия) и push
// (PushSenderService.sendToUser — никогда не бросает, best-effort, ADR-0092).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { claimAndRun } from '../common/claim-once';
import { errorMessage, errorStack } from '../common/error-info';
import { ClassRecord } from '../classes/class.schema';
import { writeNotificationRow } from '../notifications/in-app-staff-write';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { SettingsService } from '../settings/settings.service';
import { listActiveStudents } from '../users/list-active-students';
import { UserRecord } from '../users/user.schema';
import { LessonRecord } from './lesson.schema';

const LESSON_SOON_KIND = 'lesson_soon' as const;

// Кандидатов на тик — не «дай всё» (CLAUDE.md «API»), тот же порядок, что
// PROMPT_BATCH_LIMIT у RecordingPromptService: следующий тик доберёт остаток.
const LESSON_REMINDER_BATCH_LIMIT = 20;

interface DueLesson {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  startsAt: Date;
}

export interface LessonReminderResult {
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
    private readonly settingsService: SettingsService,
    private readonly pushSender: PushSenderService,
  ) {}

  async remind(now: DateTime): Promise<LessonReminderResult> {
    // Ученики без единой роли не дают ключа для defaultNotifications по
    // ролям — getManyEnabled принимает `roles: []` для каждого, тем же
    // приёмом, что defaultNotifications([]) отдаёт STUDENT_NOTIFICATIONS.
    const students = await listActiveStudents(this.userModel);
    if (students.length === 0) return { reminded: 0 };
    const studentsWithRoles = students.map((s) => ({ id: s.id, roles: [] }));
    const enabledByUser =
      await this.notificationPrefsService.getManyEnabled(studentsWithRoles);
    const recipients = students.filter((s) =>
      enabledByUser.get(s.id)?.includes(LESSON_SOON_KIND),
    );
    if (recipients.length === 0) return { reminded: 0 };

    const { lessonReminderMinutes } = await this.settingsService.get();
    const candidates = await this.lessonModel
      .find(
        {
          status: 'scheduled',
          studentReminderSentAt: { $exists: false },
          startsAt: {
            $gt: now.toJSDate(),
            $lte: now.plus({ minutes: lessonReminderMinutes }).toJSDate(),
          },
        },
        { classId: 1, startsAt: 1 },
      )
      .limit(LESSON_REMINDER_BATCH_LIMIT)
      .lean<DueLesson[]>();

    let reminded = 0;
    for (const lesson of candidates) {
      const cls = await this.classModel
        .findOne({ _id: lesson.classId, active: true }, { title: 1 })
        .lean<{ title: string } | null>();
      if (!cls) continue; // класс выключен/удалён — напоминать не о чем

      // claimAndRun — тот же приём, что RecordingPromptService.prompt:
      // падение между claim и концом работы снимает отметку, следующий тик
      // попробует снова, а не теряет напоминание навсегда.
      const done = await claimAndRun(
        this.lessonModel,
        lesson._id,
        'studentReminderSentAt',
        now,
        async () => {
          await this.notifyStudents(lesson, cls.title, recipients, now);
          return true;
        },
        (error) =>
          this.logger.error(
            `Напоминание о занятии ${lesson._id.toString()} упало после claim: ${errorMessage(error)}`,
            errorStack(error),
          ),
      );
      if (done) reminded += 1;
    }
    return { reminded };
  }

  private async notifyStudents(
    lesson: DueLesson,
    lessonTitle: string,
    recipients: readonly { id: string }[],
    now: DateTime,
  ): Promise<void> {
    const lessonId = lesson._id.toString();
    await Promise.all(
      recipients.map(async (recipient) => {
        await writeNotificationRow(this.notificationModel, {
          userId: recipient.id,
          kind: LESSON_SOON_KIND,
          lessonId,
          lessonTitle,
        });
        // Push никогда не бросает (PushSenderService.sendToUser) — лента
        // записана независимо от того, есть ли у человека подписка.
        await this.pushSender.sendToUser(recipient.id, now);
      }),
    );
  }
}
