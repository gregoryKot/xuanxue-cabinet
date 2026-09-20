// Лента уведомлений кабинета (`notifications`) — третье плечо ExamNotifier
// рядом с Telegram и почтой (InAppExamNotifier, in-app-exam-notifier.ts,
// ADR-0061): кабинет не упирается в квоту и не требует ни чата с ботом, ни
// email — поэтому становится системой записи, а Telegram остаётся слоем «в
// карман». Владение (чеклист CLAUDE.md, п.1) — `userId`, кому адресована
// запись.
//
// Свободного текста в схеме нет намеренно: заголовок строки собирает клиент
// из `kind` и ссылок (`examId`/`attemptId`), комментарий учителя остаётся в
// `exam_gradings`, уже зашифрованный там (exam-grading.schema.ts). Отсюда
// три следствия: encryption-coverage.spec.ts проходит без единого `enc`
// (только id, перечисления и даты — список «не шифровать» из чеклиста
// CLAUDE.md), формулировки на клиенте можно переписывать без миграции
// старых записей, и персональные данные (комментарий учителя) не копируются
// во вторую коллекцию.
//
// retention: TTL-индекс на createdAt, 90 дней (см. ниже) — лента не архив,
// то, что старше, не нужно ни ученику, ни учителю; коллекция чистит себя сама.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { GRADING_OUTCOMES, NOTIFICATION_KINDS } from '@xuanxue/shared';
import type { GradingOutcome, NotificationKind } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';

const NOTIFICATION_RETENTION_DAYS = 90;

@Schema({ timestamps: true, collection: 'notifications' })
export class NotificationRecord {
  // Владение — строкой, не ObjectId: та же причина, что у
  // NotificationPrefsRecord.userId (notification-prefs.schema.ts) —
  // единственное сравнение всегда с UserLean.id, который уже строка.
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, enum: NOTIFICATION_KINDS, required: true })
  kind!: NotificationKind;

  // Строкой, не ObjectId — та же причина, что userId выше: ExamGradedContext/
  // AttemptSubmittedContext (exams/exam-notifier.ts) уже держат id формы и
  // попытки строками, кастовать туда и обратно незачем.
  @Prop({ type: String, required: false })
  examId?: string;

  // Необязательно в схеме — будущие виды уведомления (не экзаменные) могут
  // приходить без привязки к попытке; уникальный индекс ниже — partial
  // именно поэтому.
  @Prop({ type: String, required: false })
  attemptId?: string;

  @Prop({ type: String, enum: GRADING_OUTCOMES, required: false })
  outcome?: GradingOutcome;

  // `null`, не просто отсутствие поля — InAppExamNotifier.write() всегда
  // $set-ит явное значение (Date при чтении, null при первой записи и при
  // переоценке): «непрочитано» и «никогда не трогали» — одно и то же
  // состояние, не два неразличимых. Тот же приём, что questionIndex/itemId
  // в bot-session.schema.ts.
  @Prop({ type: Date, required: false })
  readAt?: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(NotificationRecord);

// Идемпотентность записи (CLAUDE.md «Действие с побочным эффектом...
// идемпотентно», InAppExamNotifier.write): одна строка на (человек, вид,
// попытка) — тем же приёмом, каким deliveries упираются в
// (broadcastId, channelId). partialFilterExpression — attemptId необязателен
// в схеме (комментарий у поля выше), а частичный индекс с $exists не видит
// документы без поля вовсе — они не мешают друг другу копиться свободно.
NotificationSchema.index(
  { userId: 1, kind: 1, attemptId: 1 },
  { unique: true, partialFilterExpression: { attemptId: { $exists: true } } },
);
// Лента (`GET /me/inbox`) — свои записи, переоценённые (updatedAt) сверху:
// строка «всплывает» при переставленном итоге, не тонет на прежнем месте.
NotificationSchema.index({ userId: 1, updatedAt: -1 });
// unreadCount (`GET /me/inbox`) — count по (userId, readAt) без сканирования
// всей ленты человека.
NotificationSchema.index({ userId: 1, readAt: 1 });
// retention (см. шапку файла) — 90 дней от создания; TTL-монитор Mongo
// проверяет раз в минуту (та же оговорка, что у email_login_tokens).
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 },
);

export const NOTIFICATION_FIELD_POLICY: FieldPolicy = {
  userId: plain('id пользователя — признак владения, не свободный текст'),
  examId: plain('id формы — ссылка для клиента, не свободный текст'),
  attemptId: plain('id попытки — ссылка для клиента, не свободный текст'),
};
