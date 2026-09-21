// InAppExamNotifier — второе плечо ExamNotifier рядом с TelegramExamNotifier
// (слой in-app уведомлений, ADR-0061): пишет запись в `notifications`,
// которую отдаёт лента кабинета (`GET /me/inbox`, InboxService) —
// колокольчик, не чат. В отличие от Telegram кабинет не требует активного
// чата с ботом — записать можно любому, поэтому получатели
// `attempt_submitted` берутся не из `PersonalChats.listFor` (фильтрует по
// чату), а через `UsersService.listActiveWithRoles(roles)` — тот же пул
// ролей, что у Telegram (`rolesWithNotification`), но без требования канала
// связи. Переключатель вида уважается так же, как в остальных каналах
// (NotificationPrefsService) — выключил человек `exam_result`, записи не
// будет. Отправка — best-effort и не бросает наружу: сбой резолва (Mongo,
// гонка индекса) ловится try/catch и уходит в Logger.warn, тем же приёмом,
// что у соседнего плеча.
//
// Выбор получателей и запись строки живут в in-app-staff-write.ts: тем же
// модулем пользуется плечо «прислали ссылку на видео»
// (in-app-video-link-notifier.ts, ADR-0084).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { NotificationKind } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
  ExamNotifyResult,
} from '../exams/exam-notifier';
import { UsersService } from '../users/users.service';
import { staffWriteDeps, writeNotificationRow, writeToStaff } from './in-app-staff-write';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationRecord } from './notification.schema';

const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';
const EXAM_RESULT_KIND: NotificationKind = 'exam_result';

@Injectable()
export class InAppExamNotifier implements ExamNotifier {
  private readonly logger = new Logger(InAppExamNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly notificationPrefsService: NotificationPrefsService,
    @InjectModel(NotificationRecord.name)
    private readonly model: Model<NotificationRecord>,
  ) {}

  async notifyAttemptSubmitted(
    context: AttemptSubmittedContext,
    _now: DateTime,
  ): Promise<ExamNotifyResult> {
    try {
      const recipients = await writeToStaff(this.deps(), {
        kind: ATTEMPT_SUBMITTED_KIND,
        examId: context.examId,
        examTitle: context.examTitle,
        attemptId: context.attemptId,
      });
      return { recipients };
    } catch (err) {
      this.logger.warn(`exam.notifyAttemptSubmitted (кабинет): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
  }

  private deps() {
    return staffWriteDeps(this.usersService, this.notificationPrefsService, this.model);
  }

  // `_now` не используется — параметр остаётся ради интерфейса ExamNotifier
  // и вызывающих сервисов (тот же приём, что у TelegramExamNotifier.notifyExamGraded):
  // запись несёт своё время через timestamps: true, второго источника «сейчас» не нужно.
  async notifyExamGraded(
    context: ExamGradedContext,
    _now: DateTime,
  ): Promise<ExamNotifyResult> {
    try {
      const user = await this.usersService.findById(context.userId);
      if (!user) return { recipients: 0 };

      const prefs = await this.notificationPrefsService.get(user.id, user.roles);
      if (!prefs.enabled.includes(EXAM_RESULT_KIND)) return { recipients: 0 };

      await writeNotificationRow(this.model, {
        userId: context.userId,
        kind: EXAM_RESULT_KIND,
        examId: context.examId,
        examTitle: context.examTitle,
        attemptId: context.attemptId,
        outcome: context.outcome,
      });
      return { recipients: 1 };
    } catch (err) {
      this.logger.warn(`exam.notifyExamGraded (кабинет): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
  }

  /**
   * Идемпотентная запись — `findOneAndUpdate(upsert)`, не insert: второй тик
   * планировщика дедлайнов, второй инстанс при деплое и повторная проверка
   * одной и той же работы упираются в уникальный индекс
   * `(userId, kind, attemptId)`, не во флаг в памяти (CLAUDE.md «Действие с
   * побочным эффектом... идемпотентно», notification.schema.ts). Переоценка
   * (учитель переставил итог) `$set`-ит новый `outcome` и гасит `readAt` в
   * `null` явным значением, не `$unset` — «непрочитано» и «никогда не
   * трогали» неотличимы для клиента, а запись должна заново всплыть
   * непрочитанной, не потеряться: одна строка на работу, даже если итог
   * переставили трижды. `userId`/`kind`/`attemptId` в фильтре Mongo сам
   * подставляет в новый документ при апсерте (тот же приём, что у
   * `confirmPayment`, `payments/payments.write.ts`) — второй раз их в `$set`
   * не пишем.
   *
   * try/catch на E11000 и повтор простым `$set` без `upsert` — та же
   * защита от гонки двух конкурентных апсертов одной тройки, что у
   * `confirmPayment`: MongoDB не гарантирует, что upsert сам не столкнётся
   * с дублем при параллельной записи.
   */
}
