// Кому напомнить об оплате в этот тик (ADR-0150) — вынесено из
// PaymentReminderService: запросы к users/payments/notification_prefs отдельно
// от отправки. Тест — payment-reminder.service.spec.ts, на настоящей Mongo.
import type { Logger } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import type { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { listActiveStudents, type ActiveStudent } from '../users/list-active-students';
import type { UserRecord } from '../users/user.schema';
import type { PaymentRecord } from './payment.schema';

export const PAYMENT_DUE_KIND = 'payment_due' as const;

// Не «дай всё» (CLAUDE.md «API») и не залп на всю школу в один тик: остаток
// доберёт следующий тик — окно суток (payment-reminder-due.ts) это позволяет.
export const PAYMENT_REMINDER_BATCH_LIMIT = 50;

export interface CandidateDeps {
  userModel: Model<UserRecord>;
  paymentModel: Model<PaymentRecord>;
  notificationPrefsService: NotificationPrefsService;
  logger: Logger;
}

/** Вид включён, месяц не оплачен и напоминание не уходило — одна выборка
 * `payments` на всех, не по человеку в цикле. */
export async function findReminderCandidates(
  deps: CandidateDeps,
  month: string,
): Promise<ActiveStudent[]> {
  const students = await listActiveStudents(deps.userModel);
  // Ученики без единой роли: `roles: []` для каждого — тот же приём, что у
  // LessonReminderService (defaultNotifications([]) = STUDENT_NOTIFICATIONS).
  const enabledByUser = await deps.notificationPrefsService.getManyEnabled(
    students.map((s) => ({ id: s.id, roles: [] })),
  );
  const wanted = students.filter((s) =>
    enabledByUser.get(s.id)?.includes(PAYMENT_DUE_KIND),
  );
  if (wanted.length === 0) return [];

  const docs = await deps.paymentModel
    .find(
      { userId: { $in: wanted.map((s) => new Types.ObjectId(s.id)) }, month },
      { userId: 1, status: 1, reminderSentAt: 1 },
    )
    .lean<Pick<PaymentRecord, 'userId' | 'status' | 'reminderSentAt'>[]>();
  const skipIds = new Set(
    docs
      .filter((d) => d.status === 'paid' || d.reminderSentAt)
      .map((d) => d.userId.toString()),
  );
  // Выключил вид или уже оплатил — выбор человека, не сбой: debug, не warn.
  deps.logger.debug(
    `напоминание об оплате ${month}: учеников ${students.length}, ` +
      `вид выключили ${students.length - wanted.length}, ` +
      `оплатили или уже получили ${skipIds.size}`,
  );
  return wanted.filter((s) => !skipIds.has(s.id)).slice(0, PAYMENT_REMINDER_BATCH_LIMIT);
}
