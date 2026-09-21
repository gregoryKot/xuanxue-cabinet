// Запись строки ленты кабинета и выбор её получателей — общая часть трёх
// уведомлений: «работу сдали», «работу проверили» (in-app-exam-notifier.ts) и
// «прислали ссылку на видео» (in-app-video-link-notifier.ts, ADR-0084).
// Отдельным модулем, а не приватными методами нотификатора: файл-лимит
// CLAUDE.md («Храповики») у него уже выбран, а повтор резолва получателей в
// двух классах поймал бы jscpd.
//
// Кабинет не требует канала связи (ADR-0061), поэтому получатели берутся из
// UsersService.listActiveWithRoles, а не из PersonalChats: записать можно
// любому активному человеку с подходящей ролью. Переключатель вида уважается
// так же, как в остальных каналах (NotificationPrefsService).
import type { Model } from 'mongoose';
import { rolesWithNotification } from '@xuanxue/shared';
import type { GradingOutcome, NotificationKind } from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { UsersService } from '../users/users.service';
import { encryptRecord } from '../utils/encryption';
import type { NotificationPrefsService } from './notification-prefs.service';
import { NOTIFICATION_ENCRYPT_SCHEMA, NotificationRecord } from './notification.schema';

export interface WriteInput {
  userId: string;
  kind: NotificationKind;
  examId: string;
  examTitle: string;
  attemptId: string;
  outcome?: GradingOutcome;
}

export interface StaffWriteDeps {
  usersService: UsersService;
  notificationPrefsService: NotificationPrefsService;
  model: Model<NotificationRecord>;
}

export function staffWriteDeps(
  usersService: UsersService,
  notificationPrefsService: NotificationPrefsService,
  model: Model<NotificationRecord>,
): StaffWriteDeps {
  return { usersService, notificationPrefsService, model };
}

/** Одна строка ленты на связку (userId, kind, attemptId) — уникальный индекс.
 * Название формы шифруется той же схемой, какой маппер его расшифровывает
 * (NOTIFICATION_ENCRYPT_SCHEMA) — записать мимо неё значило бы отдать клиенту
 * шифротекст вместо названия. Повторная запись перезаписывает снимок свежим
 * названием и снова поднимает строку непрочитанной: переоценка и присланная
 * после сдачи ссылка (ADR-0084) — обе повод показать попытку заново, а не
 * завести вторую строку о том же. */
export async function writeNotificationRow(
  model: Model<NotificationRecord>,
  input: WriteInput,
): Promise<void> {
  const filter = { userId: input.userId, kind: input.kind, attemptId: input.attemptId };
  const payload = encryptRecord(
    {
      examId: input.examId,
      examTitle: input.examTitle,
      readAt: null,
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
    },
    NOTIFICATION_ENCRYPT_SCHEMA,
  );
  try {
    await model.findOneAndUpdate(filter, { $set: payload }, { upsert: true });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    await model.updateOne(filter, { $set: payload });
  }
}

export interface StaffWritePayload {
  kind: NotificationKind;
  examId: string;
  examTitle: string;
  attemptId: string;
}

/** Сколько человек получили запись — ноль означает «некому» (нет штата с
 * ролью или вид выключен у всех), не ошибку. */
export async function writeToStaff(
  deps: StaffWriteDeps,
  payload: StaffWritePayload,
): Promise<number> {
  const staff = await deps.usersService.listActiveWithRoles(
    rolesWithNotification(payload.kind),
  );
  if (staff.length === 0) return 0;

  const enabledByUser = await deps.notificationPrefsService.getManyEnabled(staff);
  const recipients = staff.filter((s) => enabledByUser.get(s.id)?.includes(payload.kind));
  if (recipients.length === 0) return 0;

  await Promise.all(
    recipients.map((r) => writeNotificationRow(deps.model, { userId: r.id, ...payload })),
  );
  return recipients.length;
}
