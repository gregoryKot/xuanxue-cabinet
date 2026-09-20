// InAppExamNotifier — третье плечо ExamNotifier рядом с TelegramExamNotifier
// и MailExamNotifier (слой in-app уведомлений, ADR-0061): пишет запись в
// `notifications`, которую отдаёт лента кабинета (`GET /me/inbox`,
// InboxService) — колокольчик, не чат и не письмо. В отличие от Telegram и
// почты кабинет не требует ни активного чата с ботом, ни email — записать
// можно любому, поэтому получатели `attempt_submitted` берутся не из
// `PersonalChats.listFor` (фильтрует по чату) и не из `listStaffWithEmail`
// (требует почту), а через `UsersService.listActiveWithRoles(roles)` — тот
// же пул ролей, что у Telegram/почты (`rolesWithNotification`), но без
// требования канала связи. Переключатель вида уважается так же, как в
// остальных каналах (NotificationPrefsService) — выключил человек
// `exam_result`, записи не будет. Отправка — best-effort и не бросает
// наружу: сбой резолва (Mongo, гонка индекса) ловится try/catch и уходит в
// Logger.warn, тем же приёмом, что у соседних плеч.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  rolesWithNotification,
  type GradingOutcome,
  type NotificationKind,
} from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
  ExamNotifyResult,
} from '../exams/exam-notifier';
import { UsersService } from '../users/users.service';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationRecord } from './notification.schema';

const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';
const EXAM_RESULT_KIND: NotificationKind = 'exam_result';

interface WriteInput {
  userId: string;
  kind: NotificationKind;
  examId: string;
  attemptId: string;
  outcome?: GradingOutcome;
}

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
      const staff = await this.usersService.listActiveWithRoles(
        rolesWithNotification(ATTEMPT_SUBMITTED_KIND),
      );
      if (staff.length === 0) return { recipients: 0 };

      const enabledByUser = await this.notificationPrefsService.getManyEnabled(staff);
      const recipients = staff.filter((s) =>
        enabledByUser.get(s.id)?.includes(ATTEMPT_SUBMITTED_KIND),
      );
      if (recipients.length === 0) return { recipients: 0 };

      await Promise.all(
        recipients.map((r) =>
          this.write({
            userId: r.id,
            kind: ATTEMPT_SUBMITTED_KIND,
            examId: context.examId,
            attemptId: context.attemptId,
          }),
        ),
      );
      return { recipients: recipients.length };
    } catch (err) {
      this.logger.warn(`exam.notifyAttemptSubmitted (кабинет): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
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

      await this.write({
        userId: context.userId,
        kind: EXAM_RESULT_KIND,
        examId: context.examId,
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
  private async write(input: WriteInput): Promise<void> {
    const filter = {
      userId: input.userId,
      kind: input.kind,
      attemptId: input.attemptId,
    };
    const payload = {
      examId: input.examId,
      readAt: null,
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
    };
    try {
      await this.model.findOneAndUpdate(filter, { $set: payload }, { upsert: true });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      await this.model.updateOne(filter, { $set: payload });
    }
  }
}
