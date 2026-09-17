// Оценка попытки (`exam_gradings`, слой 4.6, PLAN §11, ADR-0022) — данные
// ученика: `userId` — кого проверили, владение (чеклист CLAUDE.md «Новая
// коллекция с полем userId», п.1) — USER_OWNED_COLLECTIONS, удаление
// аккаунта уносит и оценку; срок хранения — вместе с попыткой (PLAN §11
// «Данные»). Хранит только итог (`outcome`) и общий комментарий учителя —
// баллы по критериям рубрики удалены с концами вместе с самой рубрикой
// (решение владельца 2026-09-17, миграция 0008-grading-without-rubric):
// критерии по умолчанию нельзя было переписать под себя в интерфейсе
// (CLAUDE.md «Кабинет учителя: всё настраивается в интерфейсе»). `comment` —
// свободный текст, шифруется как обычное поле верхнего уровня (enc).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { GRADING_OUTCOMES } from '@xuanxue/shared';
import type { GradingOutcome } from '@xuanxue/shared';
import { enc, plain, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'exam_gradings' })
export class ExamGradingRecord {
  // Идемпотентность PUT (ТЗ 4.6, п.2) — уникальный индекс ниже: одна оценка
  // на попытку, повтор переписывает, не плодит вторую запись. Без `ref`: не
  // ссылка на пользователя, ссылка на попытку (exam_attempts).
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  attemptId!: Types.ObjectId;

  // Денормализация ради фильтра учителя по форме (см. индекс ниже) — снимок
  // не устаревает: попытка не переезжает на другой экзамен после старта.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  examId!: Types.ObjectId;

  // Владение (чеклист CLAUDE.md, п.1) — ученик, чью работу проверили; по
  // этому полю уходит вместе с остальными данными ученика при удалении
  // аккаунта (USER_OWNED_COLLECTIONS). Не признак «кто проверял» — это
  // graderId ниже.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  // Кто проверил — ссылка, не признак владения (USER_REFERENCE_PATHS):
  // удаление аккаунта учителя обнуляет поле, оценка ученика остаётся.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: true })
  graderId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  comment?: string;

  @Prop({ type: String, enum: GRADING_OUTCOMES, required: true })
  outcome!: GradingOutcome;

  @Prop({ type: Date, required: true })
  gradedAt!: Date;
}

export const ExamGradingSchema = SchemaFactory.createForClass(ExamGradingRecord);
// Идемпотентность PUT /attempts/:id/grading (ТЗ 4.6, п.2, PLAN §11).
ExamGradingSchema.index({ attemptId: 1 }, { unique: true });
// Очередь/статистика учителя по форме, недавнее сверху.
ExamGradingSchema.index({ examId: 1, gradedAt: -1 });
// Экран ученика (`/me/exams`) — оценки по своим попыткам одним запросом.
ExamGradingSchema.index({ userId: 1 });

export const EXAM_GRADING_FIELD_POLICY: FieldPolicy = {
  comment: enc,
  outcome: plain('перечисление, нужно для выборок'),
};

/** Схема шифрования оценки — одна на все места чтения и записи
 * (ExamGradingsService, MyExamsService): читающий оценку мимо неё получит
 * шифротекст вместо комментария учителя. */
export const EXAM_GRADING_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_GRADING_FIELD_POLICY);
