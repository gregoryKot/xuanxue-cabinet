// Лента уведомлений кабинета (`notifications`) — третье плечо ExamNotifier
// рядом с Telegram и почтой (InAppExamNotifier, in-app-exam-notifier.ts,
// ADR-0061): кабинет не упирается в квоту и не требует ни чата с ботом, ни
// email — поэтому становится системой записи, а Telegram остаётся слоем «в
// карман». Владение (чеклист CLAUDE.md, п.1) — `userId`, кому адресована
// запись.
//
// Хранится структура, а показывается собранная на чтении строка
// (notification-text.ts, маппер): в записи нет готового предложения. Отсюда
// два следствия — формулировки переписываются без миграции старых записей, и
// схлопнуть у учителя двадцать сданных работ в «3 работы ждут проверки» можно
// будет читающим кодом, по `examId`, а не мигрируя данные. По готовому
// предложению не сгруппируешь.
//
// Исключение — `examTitle`: название формы хранится снимком, а не тянется на
// чтении. Оно уже приходит в контексте события (`examTitle` в обоих контекстах
// exams/exam-notifier.ts), второй запрос за тем, что было в руках, — работа
// впустую; к тому же удалённая или переименованная форма оставляет строку
// читаемой и честной о том, что человеку отправляли. Название пишет учитель
// руками, поэтому оно `enc` (CLAUDE.md «Безопасность»).
//
// Комментарий учителя сюда НЕ копируется — он остаётся в `exam_gradings`,
// зашифрованный там (exam-grading.schema.ts): второй копии персональных
// данных в проекте не заводим.
//
// retention: TTL-индекс на createdAt, 90 дней (см. ниже) — лента не архив,
// то, что старше, не нужно ни ученику, ни учителю; коллекция чистит себя сама.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { GRADING_OUTCOMES, NOTIFICATION_KINDS } from '@xuanxue/shared';
import type { GradingOutcome, NotificationKind } from '@xuanxue/shared';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';

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

  // Снимок названия формы на момент события (причина — шапка файла).
  // Необязательно: будущие виды уведомления вне экзамена придут без него, и
  // текст строки тогда соберётся без названия (notification-text.ts).
  @Prop({ type: String, required: false })
  examTitle?: string;

  @Prop({ type: String, enum: GRADING_OUTCOMES, required: false })
  outcome?: GradingOutcome;

  // `null`, не просто отсутствие поля — InAppExamNotifier.write() всегда
  // $set-ит явное значение (Date при чтении, null при первой записи и при
  // переоценке): «непрочитано» и «никогда не трогали» — одно и то же
  // состояние, не два неразличимых. Тот же приём, что questionIndex/itemId
  // в bot-session.schema.ts.
  @Prop({ type: Date, required: false })
  readAt?: Date | null;

  // Отзыв владельца 2026-09-22: «уведомление нельзя смахнуть, удалить» —
  // убирание из ленты мягкое, полем, а не удалением документа. Причина:
  // у ленты уникальный частичный индекс по (userId, kind, attemptId)
  // (см. ниже), и повторная доставка того же уведомления (ретрай
  // InAppExamNotifier, переоценка работы) с удалением документа воскресила
  // бы убранную запись — findOneAndUpdate с upsert снова создал бы её.
  // Коллекция и так самоочищается TTL-индексом (см. шапку файла,
  // retention: 90 дней) — второй механизм очистки не нужен. Дату не
  // шифруем (CLAUDE.md, чеклист коллекции п.3 — id, userId, даты,
  // перечисления не шифруются).
  @Prop({ type: Date, required: false })
  dismissedAt?: Date | null;
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
  examTitle: enc,
};

/** Схема шифрования записи ленты — одна на запись и на чтение
 * (InAppExamNotifier, notification.mapper.ts): читающий мимо неё получит
 * шифротекст вместо названия формы. Тот же приём, что
 * EXAM_GRADING_ENCRYPT_SCHEMA. */
export const NOTIFICATION_ENCRYPT_SCHEMA = encryptSchemaFrom(NOTIFICATION_FIELD_POLICY);
