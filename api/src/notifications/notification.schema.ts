// Лента уведомлений кабинета (`notifications`) — третье плечо ExamNotifier
// рядом с Telegram и почтой (InAppExamNotifier, ADR-0061): кабинет не упирается
// в квоту и не требует ни чата с ботом, ни email — поэтому становится системой
// записи, а Telegram остаётся слоем «в карман». Владение (чеклист CLAUDE.md,
// п.1) — `userId`, кому адресована запись.
//
// Хранится структура, а показывается собранная на чтении строка
// (notification-text.ts, маппер): в записи нет готового предложения. Отсюда
// два следствия — формулировки переписываются без миграции старых записей, и
// схлопнуть у учителя двадцать сданных работ в «3 работы ждут проверки» можно
// будет читающим кодом, по `examId`, а не мигрируя данные.
//
// Исключение — `examTitle`: название формы хранится снимком, а не тянется на
// чтении. Оно уже приходит в контексте события (exams/exam-notifier.ts),
// второй запрос за тем, что было в руках, — работа впустую; к тому же
// удалённая или переименованная форма оставляет строку читаемой и честной о
// том, что человеку отправляли. Название пишет учитель руками — `enc`
// (CLAUDE.md «Безопасность»). Так же — `lessonTitle` и `materialTitle`.
//
// Комментарий учителя сюда НЕ копируется — он остаётся в `exam_gradings`,
// зашифрованный: второй копии персональных данных в проекте не заводим.
//
// retention: TTL-индекс на createdAt, NOTIFICATION_RETENTION_DAYS (shared/, его называет /privacy).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  GRADING_OUTCOMES,
  NOTIFICATION_KINDS,
  NOTIFICATION_RETENTION_DAYS,
} from '@xuanxue/shared';
import type { GradingOutcome, NotificationKind } from '@xuanxue/shared';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'notifications' })
export class NotificationRecord {
  // Владение — строкой, не ObjectId: как NotificationPrefsRecord.userId
  // (notification-prefs.schema.ts) — сравнение всегда с UserLean.id, а он строка.
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, enum: NOTIFICATION_KINDS, required: true })
  kind!: NotificationKind;

  // Строкой, не ObjectId — та же причина, что userId выше: ExamGradedContext/
  // AttemptSubmittedContext (exams/exam-notifier.ts) уже держат id формы и
  // попытки строками, кастовать туда и обратно незачем.
  @Prop({ type: String, required: false })
  examId?: string;

  // Необязательно: виды вне экзамена приходят без попытки — поэтому индекс
  // ниже частичный.
  @Prop({ type: String, required: false })
  attemptId?: string;

  // Снимок названия формы на момент события (причина — шапка файла). Без него
  // текст строки собирается без названия (notification-text.ts).
  @Prop({ type: String, required: false })
  examTitle?: string;

  // Занятие видов про занятие (ADR-0135, ADR-0162: lesson_soon и др.) — строкой,
  // как examId; уникальный индекс ниже — идемпотентность повторной отправки
  // (второй тик, второй инстанс).
  @Prop({ type: String, required: false })
  lessonId?: string;

  // Снимок названия класса — та же причина, что examTitle выше. Название
  // пишет учитель руками, поэтому `enc` (CLAUDE.md «Безопасность»).
  @Prop({ type: String, required: false })
  lessonTitle?: string;

  // Когда занятие (`lesson_cancelled`, `recording_ready`) начиналось, UTC:
  // без числа не понять, какое отменили. Дата, не текст — не шифруется.
  @Prop({ type: Date, required: false })
  lessonStartsAt?: Date;

  // Месяц `payment_due` (ADR-0150), 'YYYY-MM' в поясе школы, строкой.
  @Prop({ type: String, required: false })
  paymentMonth?: string;

  // Материал `material_new` (ADR-0162) — строкой, как lessonId; название —
  // снимок, как lessonTitle, и тоже пишется учителем руками, поэтому `enc`.
  @Prop({ type: String, required: false })
  materialId?: string;

  @Prop({ type: String, required: false })
  materialTitle?: string;

  @Prop({ type: String, enum: GRADING_OUTCOMES, required: false })
  outcome?: GradingOutcome;

  // `null`, не просто отсутствие поля — InAppExamNotifier.write() всегда
  // $set-ит явное значение (Date при чтении, null при записи и переоценке):
  // «непрочитано» и «не трогали» — одно состояние. Приём как у questionIndex
  // в bot-session.schema.ts.
  @Prop({ type: Date, required: false })
  readAt?: Date | null;

  // Отзыв владельца 2026-09-22: «уведомление нельзя смахнуть» — убирание
  // мягкое, полем, а не удалением документа: иначе повторная доставка того же
  // события (ретрай, переоценка) снова создала бы убранную запись upsert-ом
  // по уникальному индексу ниже. Чистит коллекцию TTL (шапка файла).
  @Prop({ type: Date, required: false })
  dismissedAt?: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(NotificationRecord);

// Идемпотентность записи (CLAUDE.md «Действие с побочным эффектом идемпотентно»,
// InAppExamNotifier.write): одна строка на (человек, вид, предмет события) — тем же
// приёмом, каким deliveries упираются в (broadcastId, channelId). Предмет — попытка
// экзамена, занятие (ADR-0135, ADR-0162), месяц оплаты (ADR-0150) или материал
// (ADR-0162); у строки заполнен ровно один, а вид в ключе, поэтому строки разных
// видов одного занятия друг друга не блокируют. Индексы частичные: поле необязательно,
// а документы без него в индекс с $exists не попадают и копятся свободно.
const IDENTITY_FIELDS = ['attemptId', 'lessonId', 'paymentMonth', 'materialId'] as const;
for (const field of IDENTITY_FIELDS) {
  NotificationSchema.index(
    { userId: 1, kind: 1, [field]: 1 },
    { unique: true, partialFilterExpression: { [field]: { $exists: true } } },
  );
}
// Лента (`GET /me/inbox`) — свои записи, переоценённые (updatedAt) сверху:
// строка «всплывает» при переставленном итоге, не тонет на прежнем месте.
NotificationSchema.index({ userId: 1, updatedAt: -1 });
// unreadCount (`GET /me/inbox`) — count по (userId, readAt) без сканирования
// всей ленты человека.
NotificationSchema.index({ userId: 1, readAt: 1 });
// retention (см. шапку файла) — от создания; TTL-монитор Mongo проверяет раз в минуту.
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 },
);

export const NOTIFICATION_FIELD_POLICY: FieldPolicy = {
  userId: plain('id пользователя — признак владения, не свободный текст'),
  examId: plain('id формы — ссылка для клиента, не свободный текст'),
  attemptId: plain('id попытки — ссылка для клиента, не свободный текст'),
  examTitle: enc,
  lessonId: plain('id занятия — ссылка для клиента, не свободный текст'),
  lessonTitle: enc,
  paymentMonth: plain('месяц YYYY-MM — ключ идемпотентности, не свободный текст'),
  materialId: plain('id материала — ссылка для клиента, не свободный текст'),
  materialTitle: enc,
};

/** Схема шифрования записи ленты — одна на запись и на чтение
 * (InAppExamNotifier, notification.mapper.ts): читающий мимо неё получит
 * шифротекст вместо названия формы. Тот же приём, что
 * EXAM_GRADING_ENCRYPT_SCHEMA. */
export const NOTIFICATION_ENCRYPT_SCHEMA = encryptSchemaFrom(NOTIFICATION_FIELD_POLICY);
