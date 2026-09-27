// Отметка «ученик открыл новое задание» (отзыв тестировщицы 2026-09-23,
// ADR-0129): счётчик уведомлений должен гаснуть в момент нажатия на карточку
// задания, а не только когда ученик начнёт попытку (getMyExamAction ===
// 'start', shared/src/my-exams.ts). Отдельная маленькая коллекция, не поле на
// ExamRecord/ExamAttemptRecord — это не факт формы (её видят по-разному все
// ученики школы) и не факт попытки (попытки может не быть вовсе: ученик
// нажал «Начать», увидел «Вы начинаете экзамен» и отменил).
//
// retention (чеклист CLAUDE.md «Новая коллекция», п.4): живёт, пока жив
// аккаунт — в USER_OWNED_COLLECTIONS (user-data.registry.ts), удаление
// аккаунта уносит отметки тем же путём, что NotificationPrefsRecord. Своего
// TTL нет: коллекция не архив персональных данных, а одна строка на пару
// «ученик — форма», молчаливо переживающая саму форму до тех пор, пока жив
// аккаунт (архив форм не удаляется, PLAN §11 «Данные»).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'exam_seen_marks' })
export class ExamSeenMarkRecord {
  // Владение — строкой, не ObjectId: та же причина, что у
  // NotificationRecord.userId (notification.schema.ts) — единственное
  // сравнение всегда с UserLean.id из сессии, который уже строка.
  @Prop({ type: String, required: true })
  userId!: string;

  // Строкой, не ObjectId — та же причина, что у NotificationRecord.examId.
  @Prop({ type: String, required: true })
  examId!: string;
}

export const ExamSeenMarkSchema = SchemaFactory.createForClass(ExamSeenMarkRecord);

// Идемпотентность отметки (CLAUDE.md «Действие с побочным эффектом...
// идемпотентно»): второй клик по той же карточке, повтор запроса на плохой
// связи — упираются в уникальный индекс, не во флаг в памяти.
ExamSeenMarkSchema.index({ userId: 1, examId: 1 }, { unique: true });
// Удаление аккаунта (USER_OWNED_COLLECTIONS) чистит по userId — без индекса
// это скан всей коллекции на каждое удаление человека.
ExamSeenMarkSchema.index({ userId: 1 });

export const EXAM_SEEN_MARK_FIELD_POLICY: FieldPolicy = {
  userId: plain('id пользователя — признак владения, не свободный текст'),
  examId: plain('id формы — ссылка для клиента, не свободный текст'),
};
