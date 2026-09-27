// Запись строки ленты кабинета и выбор её получателей — общая часть четырёх
// уведомлений: «работу сдали», «работу проверили» (in-app-exam-notifier.ts),
// «прислали ссылку на видео» (in-app-video-link-notifier.ts, ADR-0084) и
// «занятие скоро» (lesson-reminder.service.ts, ADR-0135). Отдельным модулем,
// а не приватными методами нотификатора: файл-лимит CLAUDE.md («Храповики»)
// у него уже выбран, а повтор резолва получателей/записи строки в нескольких
// классах поймал бы jscpd.
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

/** Ровно одна пара «идентичность события» заполнена на вызов — та, что
 * совпадает с partial-индексом схемы (`(userId, kind, attemptId)` или
 * `(userId, kind, lessonId)`, notification.schema.ts): по экзаменным видам —
 * examId/examTitle/attemptId, по `lesson_soon` — lessonId/lessonTitle. Оба
 * набора необязательны в одном интерфейсе, а не два разных типа: строка
 * пишется одной и той же функцией для всех видов (см. шапку файла), а второй
 * тип развёл бы её на два похожих места. */
export interface WriteInput {
  userId: string;
  kind: NotificationKind;
  examId?: string;
  examTitle?: string;
  attemptId?: string;
  lessonId?: string;
  lessonTitle?: string;
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

/** Одна строка ленты на связку (userId, kind, attemptId) либо
 * (userId, kind, lessonId) — какой из двух уникальных индексов схемы
 * работает, решает то, что заполнено в `input` (см. комментарий у
 * `WriteInput`). Название формы/класса шифруется той же схемой, какой
 * маппер его расшифровывает (NOTIFICATION_ENCRYPT_SCHEMA) — записать мимо
 * неё значило бы отдать клиенту шифротекст вместо названия. Повторная
 * запись перезаписывает снимок свежим названием и снова поднимает строку
 * непрочитанной: переоценка, присланная после сдачи ссылка (ADR-0084) и
 * повторное напоминание о том же занятии (ADR-0135) — все три повод
 * показать событие заново, а не завести вторую строку о том же. */
export async function writeNotificationRow(
  model: Model<NotificationRecord>,
  input: WriteInput,
): Promise<void> {
  // lessonId — идентичность lesson_soon (частичный индекс без attemptId);
  // остальные виды всегда несут attemptId. Оба никогда не приходят вместе —
  // один вызывающий код пишет ровно одно из двух (in-app-exam-notifier.ts /
  // lesson-reminder.service.ts).
  const filter =
    input.lessonId !== undefined
      ? { userId: input.userId, kind: input.kind, lessonId: input.lessonId }
      : { userId: input.userId, kind: input.kind, attemptId: input.attemptId };
  const payload = encryptRecord(
    {
      ...(input.examId !== undefined ? { examId: input.examId } : {}),
      ...(input.examTitle !== undefined ? { examTitle: input.examTitle } : {}),
      ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}),
      ...(input.lessonTitle !== undefined ? { lessonTitle: input.lessonTitle } : {}),
      readAt: null,
      // Новое событие по той же попытке/занятию (переоценка, присланная
      // позже ссылка на видео, следующее напоминание) возвращает строку в
      // ленту, даже если её убирали: «убрано» относится к прошлому событию,
      // а не к строке навсегда. Без этого $set убранная строка молча
      // остаётся вне ленты при новой записи по тому же ключу — человек не
      // узнает о новом событии (найдено при ревью dismiss, отзыв владельца
      // 2026-09-22).
      dismissedAt: null,
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
