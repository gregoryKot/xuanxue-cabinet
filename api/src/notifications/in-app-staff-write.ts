// Запись строки ленты кабинета и выбор её получателей — общая часть уведомлений:
// «работу сдали/проверили» (in-app-exam-notifier.ts), «прислали ссылку на видео»
// (in-app-video-link-notifier.ts, ADR-0084), виды про занятие и материал (шаги
// тика в lessons/ и materials/, ADR-0135, ADR-0162) и «абонемент не оплачен»
// (payment-reminder.service.ts, ADR-0150). Отдельным модулем, а не приватными
// методами нотификатора: файл-лимит CLAUDE.md («Храповики») у него уже выбран, а
// повтор резолва получателей и записи строки в нескольких классах поймал бы jscpd.
//
// Кабинет не требует канала связи (ADR-0061): получатели — из UsersService.
// listActiveWithRoles, а не из PersonalChats, записать можно любому активному
// человеку с подходящей ролью. Переключатель вида уважается (NotificationPrefsService).
import type { Model } from 'mongoose';
import { rolesWithNotification } from '@xuanxue/shared';
import type { GradingOutcome, NotificationKind } from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { UsersService } from '../users/users.service';
import { encryptRecord } from '../utils/encryption';
import type { NotificationPrefsService } from './notification-prefs.service';
import { NOTIFICATION_ENCRYPT_SCHEMA, NotificationRecord } from './notification.schema';

/** Ровно одна «идентичность события» заполнена на вызов — та, что совпадает с
 * частичным индексом схемы (`(userId, kind, attemptId | lessonId | paymentMonth |
 * materialId)`, notification.schema.ts): по экзаменным видам — examId/examTitle/
 * attemptId, по видам про занятие — lessonId/lessonTitle (у отмены и записи ещё
 * lessonStartsAt), по `material_new` — materialId/materialTitle, по `payment_due` —
 * paymentMonth. Наборы необязательны в одном интерфейсе, а не в четырёх типах:
 * строку пишет одна функция для всех видов (шапка файла), отдельные типы развели
 * бы её на похожие места. */
export interface WriteInput {
  userId: string;
  kind: NotificationKind;
  examId?: string;
  examTitle?: string;
  attemptId?: string;
  lessonId?: string;
  lessonTitle?: string;
  /** Начало занятия (UTC) — у `lesson_cancelled` и `recording_ready`, ADR-0162. */
  lessonStartsAt?: Date;
  materialId?: string;
  /** Снимок названия материала — шифруется схемой ленты, как `lessonTitle`. */
  materialTitle?: string;
  paymentMonth?: string;
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

// Идентичность строки: lessonId, materialId или paymentMonth — по виду, иначе
// attemptId (экзаменные виды всегда его несут); вместе они не приходят.
export function identityFilter(input: WriteInput): Record<string, string | undefined> {
  const base = { userId: input.userId, kind: input.kind };
  if (input.lessonId !== undefined) return { ...base, lessonId: input.lessonId };
  if (input.materialId !== undefined) return { ...base, materialId: input.materialId };
  if (input.paymentMonth !== undefined) {
    return { ...base, paymentMonth: input.paymentMonth };
  }
  return { ...base, attemptId: input.attemptId };
}

/** Поля строки ленты, общие для «записать поверх» и «записать, только если нет»
 * (notification-row-once.ts). Названия шифруются той же схемой, какой маппер их
 * расшифровывает (NOTIFICATION_ENCRYPT_SCHEMA): мимо неё клиент получил бы шифротекст. */
export function rowPayload(input: WriteInput): Record<string, unknown> {
  return encryptRecord(
    {
      ...(input.examId !== undefined ? { examId: input.examId } : {}),
      ...(input.examTitle !== undefined ? { examTitle: input.examTitle } : {}),
      ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}),
      ...(input.lessonTitle !== undefined ? { lessonTitle: input.lessonTitle } : {}),
      ...(input.lessonStartsAt !== undefined
        ? { lessonStartsAt: input.lessonStartsAt }
        : {}),
      ...(input.materialId !== undefined ? { materialId: input.materialId } : {}),
      ...(input.materialTitle !== undefined
        ? { materialTitle: input.materialTitle }
        : {}),
      ...(input.paymentMonth !== undefined ? { paymentMonth: input.paymentMonth } : {}),
      readAt: null,
      // Новое событие по той же попытке (переоценка, присланная позже ссылка на
      // видео) возвращает строку в ленту, даже если её убирали: «убрано» — про
      // прошлое событие, а не про строку навсегда. Без этого убранная строка
      // молча оставалась бы вне ленты, и человек не узнал бы о новом событии
      // (найдено при ревью dismiss, отзыв владельца 2026-09-22).
      dismissedAt: null,
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
    },
    NOTIFICATION_ENCRYPT_SCHEMA,
  );
}

/** Одна строка ленты на связку (userId, kind, предмет события) — какой из
 * уникальных индексов схемы работает, решает то, что заполнено в `input`
 * (комментарий у `WriteInput`). Повторная запись перезаписывает снимок свежим
 * названием и снова поднимает строку непрочитанной: переоценка и присланная
 * после сдачи ссылка (ADR-0084) — повод показать событие заново, а не завести
 * вторую строку о том же. Виды про занятие и материал так не пишутся: они
 * молчат о повторе (`insertNotificationRowOnce`, ADR-0162). */
export async function writeNotificationRow(
  model: Model<NotificationRecord>,
  input: WriteInput,
): Promise<void> {
  const filter = identityFilter(input);
  const payload = rowPayload(input);
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
