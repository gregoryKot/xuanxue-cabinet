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

/** Какие числа месяца сейчас открыты (`openReminderDays`) и какой день у
 * школы — для тех, кто своего дня не выбирал (ADR-0161). */
export interface ReminderDays {
  open: ReadonlySet<number>;
  schoolDay: number;
}

/** Вид включён, день ученика (свой, а нет — школы) сейчас открыт, месяц не
 * оплачен и напоминание не уходило — по одной выборке `notification_prefs` и
 * `payments` на всех, не по человеку в цикле. */
export async function findReminderCandidates(
  deps: CandidateDeps,
  month: string,
  days: ReminderDays,
): Promise<ActiveStudent[]> {
  const students = await listActiveStudents(deps.userModel);
  // Ученики без единой роли: `roles: []` для каждого — тот же приём, что у
  // LessonReminderService (defaultNotifications([]) = STUDENT_NOTIFICATIONS).
  const enabledByUser = await deps.notificationPrefsService.getManyEnabled(
    students.map((s) => ({ id: s.id, roles: [] })),
  );
  const enabled = students.filter((s) =>
    enabledByUser.get(s.id)?.includes(PAYMENT_DUE_KIND),
  );
  if (enabled.length === 0) return [];
  const ownDays = await deps.notificationPrefsService.getPaymentReminderDays(
    enabled.map((s) => s.id),
  );
  const wanted = enabled.filter((s) =>
    days.open.has(ownDays.get(s.id) ?? days.schoolDay),
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
  // Выключил вид, ждёт своего дня или уже оплатил — выбор человека, не сбой:
  // debug, не warn.
  deps.logger.debug(
    `напоминание об оплате ${month}: учеников ${students.length}, ` +
      `вид выключили ${students.length - enabled.length}, ` +
      `день не сегодня ${enabled.length - wanted.length}, ` +
      `оплатили или уже получили ${skipIds.size}`,
  );
  return wanted.filter((s) => !skipIds.has(s.id)).slice(0, PAYMENT_REMINDER_BATCH_LIMIT);
}
